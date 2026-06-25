import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { getValuation } from "../src/usecase/index.js";
import { SnapshotSeriesCache } from "../src/persistence/index.js";
import { VALUATION_SERIES_CAP } from "../src/usecase/stockPageDeps.js";
import type { ValuationPoint } from "../src/domain/index.js";

/** Build a ValuationPoint with a per-day pe/pb. */
function vp(date: string, pe: number | null, pb: number | null): ValuationPoint {
  return { date, pe, pb, dividendYieldPct: 3.0 };
}

/**
 * Build a real per-symbol valuation series cache over a tmp dir and pre-seed
 * `symbol`'s ascending series. The injected fetcher feeds one point per
 * upsertLatest call so the persisted series ends up holding exactly `points`.
 */
async function seededCache(
  dataDir: string,
  symbol: string,
  points: ValuationPoint[],
): Promise<SnapshotSeriesCache<ValuationPoint>> {
  let i = 0;
  const cache = new SnapshotSeriesCache<ValuationPoint>(
    dataDir,
    "valuation",
    (p) => p.date,
    VALUATION_SERIES_CAP,
    async () => points[i++] ?? null,
  );
  for (let k = 0; k < points.length; k++) await cache.upsertLatest(symbol);
  return cache;
}

describe("usecase/getValuation (PE + PB river over per-symbol series)", () => {
  let dataDir: string;
  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "val-test-"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("accumulates series into PE & PB bands; current = latest day", async () => {
    // Ascending series with PE rising to 30 (latest) and PB to 5 (latest). The
    // latest day is the highest → current sits at/above p80 → zone 'expensive'.
    const points: ValuationPoint[] = [
      vp("1150618", 11, 1.1),
      vp("1150619", 12, 1.2),
      vp("1150622", 13, 1.3),
      vp("1150623", 14, 1.4),
      vp("1150624", 30, 5.0),
    ];
    const cache = await seededCache(dataDir, "1513", points);

    const view = await getValuation({ valuationSeries: cache }, "1513");
    expect(view.coverage).toBe(true);
    expect(view.pe).not.toBeNull();
    expect(view.pb).not.toBeNull();
    expect(view.pe!.current).toBe(30); // latest day (newest-first index 0)
    expect(view.pe!.zone).toBe("expensive");
    expect(view.pb!.current).toBe(5.0);
    // series is newest-first.
    expect(view.series[0]!.date).toBe("1150624");
    // PE and PB share one bandFromSeries — both bands have the same point count.
    expect(view.pe!.count).toBe(view.pb!.count);
  });

  it("orders by numeric date, not lexicographic (ROC widths differ)", async () => {
    // A 6-digit ROC date "940103" (=民國94 → 2005) and a 7-digit "1150624"
    // (=民國115 → 2026). Lexicographic sort would put "940103" AFTER "1150624"
    // ('9' > '1'), wrongly making the 2005 point newest. Numeric Number(date)
    // ordering must place 1150624 as newest (current).
    const points: ValuationPoint[] = [
      vp("940103", 8, 0.8),
      vp("1150624", 25, 2.5),
    ];
    const cache = await seededCache(dataDir, "1513", points);

    const view = await getValuation({ valuationSeries: cache }, "1513");
    expect(view.coverage).toBe(true);
    expect(view.series[0]!.date).toBe("1150624"); // 2026 is newest
    expect(view.pe!.current).toBe(25); // current = newest day's PE
    expect(view.pb!.current).toBe(2.5);
  });

  it("skips empty PEratio points (台泥-style blank) — null dropped from band", async () => {
    // Latest day has a blank PE (null) but a valid PB. The PE band is built from
    // the non-null points only and current PE is null (no placement).
    const points: ValuationPoint[] = [
      vp("1150622", 22, 1.6),
      vp("1150623", 20, 1.5),
      vp("1150624", null, 0.9),
    ];
    const cache = await seededCache(dataDir, "1101", points);

    const view = await getValuation({ valuationSeries: cache }, "1101");
    expect(view.coverage).toBe(true);
    expect(view.pe!.count).toBe(2); // the null PE point is dropped
    expect(view.pe!.current).toBeNull(); // latest PE is blank → no placement
    expect(view.pb!.current).toBe(0.9);
  });

  it("folds a fresh official day in on the request path (upsertLatest), keeping seeded points", async () => {
    // Seed an older series, then arm the fetcher with ONE more, newer day. The
    // request must call upsertLatest so the fresh day appears at the head while
    // the seeded points stay intact.
    const seeded: ValuationPoint[] = [
      vp("1150620", 12, 1.2),
      vp("1150621", 13, 1.3),
    ];
    const fresh = vp("1150624", 18, 1.8);
    let i = 0;
    const queue = [...seeded, fresh];
    const cache = new SnapshotSeriesCache<ValuationPoint>(
      dataDir,
      "valuation",
      (p) => p.date,
      VALUATION_SERIES_CAP,
      async () => queue[i++] ?? null,
    );
    // Seed the persisted series with the older days only (no fresh day yet).
    await cache.upsertLatest("1513");
    await cache.upsertLatest("1513");

    const view = await getValuation({ valuationSeries: cache }, "1513");
    const dates = view.series.map((d) => d.date);
    expect(dates).toContain("1150624"); // fresh day folded in by the request
    expect(dates).toContain("1150620"); // seeded points unchanged
    expect(dates).toContain("1150621");
    expect(view.series[0]!.date).toBe("1150624"); // fresh day is newest
    expect(view.coverage).toBe(true);
  });

  it("falls back to the seeded series when the continuation fetch rejects", async () => {
    // Seed two days via a working fetcher, then swap to one that throws so
    // upsertLatest REJECTS. getValuation must NOT lose the seeded history: it
    // falls back to getSeries and never throws.
    let mode: "seed" | "boom" = "seed";
    const seeded = [vp("1150620", 12, 1.2), vp("1150621", 13, 1.3)];
    let i = 0;
    const cache = new SnapshotSeriesCache<ValuationPoint>(
      dataDir,
      "valuation",
      (p) => p.date,
      VALUATION_SERIES_CAP,
      async () => {
        if (mode === "boom") throw new Error("network down");
        return seeded[i++] ?? null;
      },
    );
    await cache.upsertLatest("1513");
    await cache.upsertLatest("1513");
    mode = "boom";

    const view = await getValuation({ valuationSeries: cache }, "1513");
    expect(view.coverage).toBe(true); // seeded history preserved
    const dates = view.series.map((d) => d.date);
    expect(dates).toContain("1150620");
    expect(dates).toContain("1150621");
  });

  it("empty series → both bands null + coverage:false (cold start)", async () => {
    const cache = new SnapshotSeriesCache<ValuationPoint>(
      dataDir,
      "valuation",
      (p) => p.date,
      VALUATION_SERIES_CAP,
      async () => null,
    );
    const view = await getValuation({ valuationSeries: cache }, "9999");
    expect(view.coverage).toBe(false);
    expect(view.pe).toBeNull();
    expect(view.pb).toBeNull();
  });
});
