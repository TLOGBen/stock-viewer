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

  describe("seedSeries (whole-series write)", () => {
    const noFetch: LatestItemFetcher<Rev> = async () => null;

    it("writes a whole historical series atomically with the SeriesFile shape", async () => {
      const cache = new SnapshotSeriesCache<Rev>(dataDir, "revenue", KEY, CAP, noFetch);
      const items: Rev[] = [
        { yearMonth: "2026-03", revenueThousands: 1 },
        { yearMonth: "2026-04", revenueThousands: 2 },
        { yearMonth: "2026-05", revenueThousands: 3 },
      ];

      const result = await cache.seedSeries("1513", items);
      expect(result).toEqual(items);

      const file = await fs.readFile(
        path.join(dataDir, "revenue", "1513.json"),
        "utf8",
      );
      const parsed = JSON.parse(file) as { asOf: number; items: Rev[] };
      expect(typeof parsed.asOf).toBe("number");
      expect(parsed.items).toEqual(items);

      const entries = await fs.readdir(path.join(dataDir, "revenue"));
      expect(entries.some((e) => e.endsWith(".tmp"))).toBe(false);
    });

    it("de-dups by key — re-seeding the same period replaces (latest wins)", async () => {
      const cache = new SnapshotSeriesCache<Rev>(dataDir, "revenue", KEY, CAP, noFetch);
      await cache.seedSeries("1513", [
        { yearMonth: "2026-05", revenueThousands: 100 },
      ]);
      const result = await cache.seedSeries("1513", [
        { yearMonth: "2026-05", revenueThousands: 200 },
        { yearMonth: "2026-06", revenueThousands: 5 },
      ]);
      expect(result).toEqual([
        { yearMonth: "2026-05", revenueThousands: 200 },
        { yearMonth: "2026-06", revenueThousands: 5 },
      ]);
    });

    it("caps from the front (trims oldest) when the merged series exceeds cap", async () => {
      const smallCap = 3;
      const cache = new SnapshotSeriesCache<Rev>(
        dataDir,
        "revenue",
        KEY,
        smallCap,
        noFetch,
      );
      const items: Rev[] = [
        { yearMonth: "2026-01", revenueThousands: 1 },
        { yearMonth: "2026-02", revenueThousands: 2 },
        { yearMonth: "2026-03", revenueThousands: 3 },
        { yearMonth: "2026-04", revenueThousands: 4 },
        { yearMonth: "2026-05", revenueThousands: 5 },
      ];
      const result = await cache.seedSeries("1513", items);
      expect(result.map((r) => r.yearMonth)).toEqual([
        "2026-03",
        "2026-04",
        "2026-05",
      ]);
    });

    it("is idempotent — seeding the same items twice yields identical file contents", async () => {
      const cache = new SnapshotSeriesCache<Rev>(dataDir, "revenue", KEY, CAP, noFetch);
      const items: Rev[] = [
        { yearMonth: "2026-03", revenueThousands: 1 },
        { yearMonth: "2026-04", revenueThousands: 2 },
      ];
      await cache.seedSeries("1513", items);
      const after1 = JSON.parse(
        await fs.readFile(path.join(dataDir, "revenue", "1513.json"), "utf8"),
      ) as { items: Rev[] };

      await cache.seedSeries("1513", items);
      const after2 = JSON.parse(
        await fs.readFile(path.join(dataDir, "revenue", "1513.json"), "utf8"),
      ) as { items: Rev[] };

      expect(after2.items).toEqual(after1.items);
    });

    it("blocks path traversal — a crafted symbol can never escape, never throws", async () => {
      const cache = new SnapshotSeriesCache<Rev>(dataDir, "revenue", KEY, CAP, noFetch);
      await expect(
        cache.seedSeries("../escape", [
          { yearMonth: "2026-05", revenueThousands: 1 },
        ]),
      ).resolves.toBeDefined();
      const escaped = path.join(dataDir, "escape.json");
      await expect(fs.access(escaped)).rejects.toThrow();
    });
  });
});
