import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { getRevenue } from "../src/usecase/index.js";
import {
  SnapshotSeriesCache,
  type LatestItemFetcher,
} from "../src/persistence/index.js";
import type { MonthlyRevenue } from "../src/domain/index.js";

const KEY = (r: MonthlyRevenue): string => r.yearMonth;
const CAP = 24;

/** 1513 2026-05 當月營收 = 2392022 千元 (known true value from ap05 fixture). */
const may1513: MonthlyRevenue = {
  yearMonth: "2026-05",
  revenueThousands: 2392022,
  momPct: 3.65,
  yoyPct: 3.62,
  accYoyPct: 5.1,
};

describe("usecase/getRevenue", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "gr-test-"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("folds the latest snapshot into a per-symbol series (cold-start single point)", async () => {
    const fetchLatest: LatestItemFetcher<MonthlyRevenue> = async () => may1513;
    const revenue = new SnapshotSeriesCache(dataDir, "revenue", KEY, CAP, fetchLatest);

    const view = await getRevenue({ revenue }, "1513");
    expect(view.coverage).toBe(true);
    expect(view.series).toHaveLength(1);
    expect(view.series[0]!.revenueThousands).toBe(2392022); // 千元, not re-scaled
  });

  it("coverage:false on an empty series (symbol absent in snapshot)", async () => {
    const revenue = new SnapshotSeriesCache<MonthlyRevenue>(
      dataDir,
      "revenue",
      KEY,
      CAP,
      async () => null,
    );
    const view = await getRevenue({ revenue }, "9999");
    expect(view.coverage).toBe(false);
    expect(view.series).toEqual([]);
  });

  it("never throws when the fetcher rejects — falls back to persisted series", async () => {
    // Seed one period, then a fetcher that rejects on the next upsert.
    let reject = false;
    const fetchLatest: LatestItemFetcher<MonthlyRevenue> = async () => {
      if (reject) throw new Error("opendata down");
      return may1513;
    };
    const revenue = new SnapshotSeriesCache(dataDir, "revenue", KEY, CAP, fetchLatest);
    await getRevenue({ revenue }, "1513"); // persists 2026-05

    reject = true;
    const view = await getRevenue({ revenue }, "1513");
    // upsertLatest threw, but the usecase fell back to getSeries (persisted).
    expect(view.coverage).toBe(true);
    expect(view.series[0]!.yearMonth).toBe("2026-05");
  });
});
