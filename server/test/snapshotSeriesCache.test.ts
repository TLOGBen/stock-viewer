import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  SnapshotSeriesCache,
  type LatestItemFetcher,
} from "../src/persistence/snapshotSeriesCache.js";

/** A revenue-like series item keyed by its period. */
interface Rev {
  yearMonth: string;
  revenueThousands: number;
}

const KEY = (r: Rev): string => r.yearMonth;
const CAP = 24;

describe("SnapshotSeriesCache", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "ssc-test-"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("upserts the latest snapshot into a per-symbol series and persists atomically", async () => {
    const fetchLatest: LatestItemFetcher<Rev> = async () => ({
      yearMonth: "2026-05",
      revenueThousands: 2392022,
    });
    const cache = new SnapshotSeriesCache<Rev>(dataDir, "revenue", KEY, CAP, fetchLatest);

    const series = await cache.upsertLatest("1513");
    expect(series).toEqual([{ yearMonth: "2026-05", revenueThousands: 2392022 }]);

    const file = await fs.readFile(
      path.join(dataDir, "revenue", "1513.json"),
      "utf8",
    );
    const parsed = JSON.parse(file) as { asOf: number; items: Rev[] };
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]!.revenueThousands).toBe(2392022);

    const entries = await fs.readdir(path.join(dataDir, "revenue"));
    expect(entries.some((e) => e.endsWith(".tmp"))).toBe(false);
  });

  it("de-duplicates by key — re-upserting the same period replaces, not appends", async () => {
    let val = 100;
    const fetchLatest: LatestItemFetcher<Rev> = async () => ({
      yearMonth: "2026-05",
      revenueThousands: val,
    });
    const cache = new SnapshotSeriesCache<Rev>(dataDir, "revenue", KEY, CAP, fetchLatest);

    await cache.upsertLatest("1513");
    val = 200; // same period, newer value
    const series = await cache.upsertLatest("1513");

    expect(series).toHaveLength(1);
    expect(series[0]!.revenueThousands).toBe(200); // latest write wins
  });

  it("accumulates distinct periods across upserts (history built over time)", async () => {
    const items: Rev[] = [
      { yearMonth: "2026-04", revenueThousands: 1 },
      { yearMonth: "2026-05", revenueThousands: 2 },
    ];
    let i = 0;
    const fetchLatest: LatestItemFetcher<Rev> = async () => items[i++]!;
    const cache = new SnapshotSeriesCache<Rev>(dataDir, "revenue", KEY, CAP, fetchLatest);

    await cache.upsertLatest("1513");
    const series = await cache.upsertLatest("1513");
    expect(series.map((r) => r.yearMonth)).toEqual(["2026-04", "2026-05"]);
  });

  it("returns the existing series untouched when the latest fetch is null (symbol absent)", async () => {
    let item: Rev | null = { yearMonth: "2026-05", revenueThousands: 9 };
    const fetchLatest: LatestItemFetcher<Rev> = async () => item;
    const cache = new SnapshotSeriesCache<Rev>(dataDir, "revenue", KEY, CAP, fetchLatest);

    await cache.upsertLatest("1513");
    item = null; // symbol now absent in snapshot
    const series = await cache.upsertLatest("1513");
    expect(series).toEqual([{ yearMonth: "2026-05", revenueThousands: 9 }]);
  });

  it("blocks path traversal — a '../' symbol can never escape the cache dir", async () => {
    const fetchLatest: LatestItemFetcher<Rev> = async () => ({
      yearMonth: "2026-05",
      revenueThousands: 1,
    });
    const cache = new SnapshotSeriesCache<Rev>(dataDir, "revenue", KEY, CAP, fetchLatest);

    // getSeries swallows the guard throw → [] (never throws to caller).
    await expect(cache.getSeries("../../watchlist")).resolves.toEqual([]);
    await expect(cache.getSeries("a/b")).resolves.toEqual([]);

    // No file is ever written outside revenue/ for a crafted symbol.
    await cache.upsertLatest("../escape").catch(() => undefined);
    const escaped = path.join(dataDir, "escape.json");
    await expect(fs.access(escaped)).rejects.toThrow();
  });

  it("getSeries returns [] for a missing symbol (never throws)", async () => {
    const cache = new SnapshotSeriesCache<Rev>(
      dataDir,
      "revenue",
      KEY,
      CAP,
      async () => null,
    );
    await expect(cache.getSeries("9999")).resolves.toEqual([]);
  });
});
