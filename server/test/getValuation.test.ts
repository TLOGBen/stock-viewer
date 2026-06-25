import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { getValuation } from "../src/usecase/index.js";
import {
  BulkByDateCache,
  type BulkByDateFetcher,
} from "../src/persistence/index.js";
import type { ValuationPoint } from "../src/domain/index.js";

const NOW = new Date(Date.UTC(2026, 5, 24)); // Wednesday

/** Build a ValuationPoint with a per-day pe/pb. */
function vp(date: string, pe: number | null, pb: number | null): ValuationPoint {
  return { date, pe, pb, dividendYieldPct: 3.0 };
}

describe("usecase/getValuation (PE + PB river over cache A)", () => {
  let dataDir: string;
  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "val-test-"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("accumulates BWIBBU days into PE & PB bands; current = latest day", async () => {
    // Five days of PE rising to 30 (latest) and PB to 5 (latest). The latest
    // day is the highest → current sits at/above p80 → zone 'expensive'.
    const byDate: Record<string, ValuationPoint> = {
      "20260624": vp("1150624", 30, 5.0),
      "20260623": vp("1150623", 14, 1.4),
      "20260622": vp("1150622", 13, 1.3),
      "20260619": vp("1150619", 12, 1.2),
      "20260618": vp("1150618", 11, 1.1),
    };
    const fetchDay: BulkByDateFetcher<ValuationPoint> = async (date) =>
      byDate[date] ? new Map([["1513", byDate[date]!]]) : new Map();
    const cache = new BulkByDateCache(dataDir, "bwibbu", fetchDay, 0);

    const view = await getValuation({ valuation: cache }, "1513", NOW, 6);
    expect(view.coverage).toBe(true);
    expect(view.pe).not.toBeNull();
    expect(view.pb).not.toBeNull();
    expect(view.pe!.current).toBe(30); // latest day (newest-first index 0)
    expect(view.pe!.zone).toBe("expensive");
    expect(view.pb!.current).toBe(5.0);
    // PE and PB share one bandFromSeries — both bands have the same point count.
    expect(view.pe!.count).toBe(view.pb!.count);
  });

  it("skips empty PEratio points (台泥-style blank) — null dropped from band", async () => {
    // Latest day has a blank PE (null) but a valid PB. The PE band is built from
    // the non-null points only and current PE is null (no placement).
    const byDate: Record<string, ValuationPoint> = {
      "20260624": vp("1150624", null, 0.9),
      "20260623": vp("1150623", 20, 1.5),
      "20260622": vp("1150622", 22, 1.6),
    };
    const fetchDay: BulkByDateFetcher<ValuationPoint> = async (date) =>
      byDate[date] ? new Map([["1101", byDate[date]!]]) : new Map();
    const cache = new BulkByDateCache(dataDir, "bwibbu", fetchDay, 0);

    const view = await getValuation({ valuation: cache }, "1101", NOW, 5);
    expect(view.coverage).toBe(true);
    expect(view.pe!.count).toBe(2); // the null PE point is dropped
    expect(view.pe!.current).toBeNull(); // latest PE is blank → no placement
    expect(view.pb!.current).toBe(0.9);
  });

  it("empty sweep → both bands null + coverage:false (cold start)", async () => {
    const cache = new BulkByDateCache<ValuationPoint>(
      dataDir,
      "bwibbu",
      async () => new Map(),
      0,
    );
    const view = await getValuation({ valuation: cache }, "9999", NOW, 5);
    expect(view.coverage).toBe(false);
    expect(view.pe).toBeNull();
    expect(view.pb).toBeNull();
  });
});
