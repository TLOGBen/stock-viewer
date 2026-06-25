import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  SnapshotSeriesCache,
  type LatestItemFetcher,
} from "../src/persistence/snapshotSeriesCache.js";
import type { ValuationPoint } from "../src/domain/index.js";

/**
 * Integration: the runtime 估值 continuation (upsertLatest, fed by the BWIBBU
 * per-symbol fetcher) must MERGE the fresh day into a series that a build-time
 * FinMind backfill (seedSeries) already populated — without clobbering the
 * seeded history. Mirrors the production wiring in index.ts buildStockPageDeps:
 * keyFn = p => p.date, source = valuation-series. Proves the cache-B continuation
 * preserves a multi-year history rather than overwriting it each refresh.
 */

const KEY = (p: ValuationPoint): string => p.date;
const CAP = 1500;
const SYMBOL = "2330";

/** A seeded ValuationPoint for an ROC packed date with deterministic values. */
function pt(date: string, pe: number): ValuationPoint {
  return { date, pe, pb: pe / 10, dividendYieldPct: 2.5 };
}

describe("estimate (valuation) runtime continuation over a seeded series", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "valcont-test-"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  const SEED: ValuationPoint[] = [
    pt("1150620", 20),
    pt("1150621", 21),
    pt("1150622", 22),
    pt("1150623", 23),
    pt("1150624", 24),
  ];

  it("merges the fresh runtime day into the seeded history without clobbering it", async () => {
    const fresh = pt("1150625", 25);
    const fetchLatest: LatestItemFetcher<ValuationPoint> = async () => fresh;
    const cache = new SnapshotSeriesCache<ValuationPoint>(
      dataDir,
      "valuation-series",
      KEY,
      CAP,
      fetchLatest,
    );

    // build-time FinMind backfill seed (prior history on disk)
    await cache.seedSeries(SYMBOL, SEED);

    // runtime 續抽 of the latest official BWIBBU day
    const merged = await cache.upsertLatest(SYMBOL);

    // 1) both the seeded history AND the new day survive (no loss)
    expect(merged.map((p) => p.date)).toEqual([
      "1150620",
      "1150621",
      "1150622",
      "1150623",
      "1150624",
      "1150625",
    ]);

    // 2) deduped by date — no duplicate dates
    const dates = merged.map((p) => p.date);
    expect(new Set(dates).size).toBe(dates.length);

    // 3) seeded older points' values are unchanged (no clobber)
    for (const seeded of SEED) {
      const kept = merged.find((p) => p.date === seeded.date);
      expect(kept).toEqual(seeded);
    }

    // 4) the new day is present with the fetched values
    expect(merged.find((p) => p.date === "1150625")).toEqual(fresh);
  });

  it("re-upserting the same day overwrites only that day's values (latest write wins, deduped)", async () => {
    let day = pt("1150625", 25);
    const fetchLatest: LatestItemFetcher<ValuationPoint> = async () => day;
    const cache = new SnapshotSeriesCache<ValuationPoint>(
      dataDir,
      "valuation-series",
      KEY,
      CAP,
      fetchLatest,
    );

    await cache.seedSeries(SYMBOL, SEED);
    await cache.upsertLatest(SYMBOL);

    // a corrected value lands later the same day
    day = pt("1150625", 26);
    const merged = await cache.upsertLatest(SYMBOL);

    // still a single 1150625 entry, with the corrected value; seed intact
    expect(merged.map((p) => p.date)).toEqual([
      "1150620",
      "1150621",
      "1150622",
      "1150623",
      "1150624",
      "1150625",
    ]);
    expect(merged.find((p) => p.date === "1150625")?.pe).toBe(26);
    for (const seeded of SEED) {
      expect(merged.find((p) => p.date === seeded.date)).toEqual(seeded);
    }
  });

  it("upsertLatest with the symbol absent (fetcher → null) returns the seeded series untouched (never-throw)", async () => {
    const fetchLatest: LatestItemFetcher<ValuationPoint> = async () => null;
    const cache = new SnapshotSeriesCache<ValuationPoint>(
      dataDir,
      "valuation-series",
      KEY,
      CAP,
      fetchLatest,
    );

    await cache.seedSeries(SYMBOL, SEED);
    const merged = await cache.upsertLatest(SYMBOL);

    expect(merged).toEqual(SEED);
    // persisted file is unchanged too
    expect(await cache.getSeries(SYMBOL)).toEqual(SEED);
  });
});
