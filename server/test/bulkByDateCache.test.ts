import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  BulkByDateCache,
  type BulkByDateFetcher,
} from "../src/persistence/bulkByDateCache.js";

/** A trivial domain-ish row type for the cache tests. */
interface Flow {
  totalNet: number;
}

describe("BulkByDateCache", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bbd-test-"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("fetches a day once, persists it atomically, and serves it from memory", async () => {
    const fetchDay: BulkByDateFetcher<Flow> = vi.fn(async () =>
      new Map([["1513", { totalNet: 945.5 }]]),
    );
    const cache = new BulkByDateCache<Flow>(dataDir, "t86", fetchDay, 0);

    const map1 = await cache.getDayMap("20260624");
    const map2 = await cache.getDayMap("20260624"); // memory hit

    expect(map1.get("1513")?.totalNet).toBe(945.5);
    expect(map2.get("1513")?.totalNet).toBe(945.5);
    expect((fetchDay as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);

    // Persisted as {date}.json under the source sub-dir.
    const file = await fs.readFile(
      path.join(dataDir, "t86", "20260624.json"),
      "utf8",
    );
    const parsed = JSON.parse(file) as { date: string; entries: [string, Flow][] };
    expect(parsed.date).toBe("20260624");
    expect(parsed.entries).toEqual([["1513", { totalNet: 945.5 }]]);

    const entries = await fs.readdir(path.join(dataDir, "t86"));
    expect(entries.some((e) => e.endsWith(".tmp"))).toBe(false);
  });

  it("treats an existing day file as immutable (a fresh instance never refetches)", async () => {
    const seed: BulkByDateFetcher<Flow> = async () =>
      new Map([["1513", { totalNet: 10 }]]);
    await new BulkByDateCache<Flow>(dataDir, "t86", seed, 0).getDayMap("20260624");

    // New instance with a DIFFERENT fetcher; the persisted day must win.
    const fetchDay = vi.fn(async () => new Map([["1513", { totalNet: 999 }]]));
    const cache = new BulkByDateCache<Flow>(
      dataDir,
      "t86",
      fetchDay as BulkByDateFetcher<Flow>,
      0,
    );
    const map = await cache.getDayMap("20260624");

    expect(map.get("1513")?.totalNet).toBe(10); // old immutable value
    expect(fetchDay.mock.calls.length).toBe(0); // no refetch
  });

  it("never throws when a day's fetch rejects — degrades to an empty map", async () => {
    const fetchDay: BulkByDateFetcher<Flow> = async () => {
      throw new Error("upstream 500");
    };
    const cache = new BulkByDateCache<Flow>(dataDir, "t86", fetchDay, 0);

    const map = await cache.getDayMap("20260624");
    expect(map.size).toBe(0);
  });

  it("getRecentDays skips empty/failed days and keeps the rest (one source's bad day does not drop the others)", async () => {
    // Day A ok, day B fails, day C ok — B must not break A or C.
    const fetchDay: BulkByDateFetcher<Flow> = async (date) => {
      if (date === "20260623") throw new Error("missing day");
      return new Map([["1513", { totalNet: date === "20260624" ? 1 : 3 }]]);
    };
    const cache = new BulkByDateCache<Flow>(dataDir, "t86", fetchDay, 0);

    const days = await cache.getRecentDays(["20260624", "20260623", "20260622"]);
    expect(days.map((d) => d.date)).toEqual(["20260624", "20260622"]);
    expect(days[0]!.map.get("1513")?.totalNet).toBe(1);
    expect(days[1]!.map.get("1513")?.totalNet).toBe(3);
  });

  it("isolates two source instances — one failing source never affects the other", async () => {
    const goodFetch: BulkByDateFetcher<Flow> = async () =>
      new Map([["1513", { totalNet: 7 }]]);
    const badFetch: BulkByDateFetcher<Flow> = async () => {
      throw new Error("source down");
    };
    const t86 = new BulkByDateCache<Flow>(dataDir, "t86", goodFetch, 0);
    const margin = new BulkByDateCache<Flow>(dataDir, "margin", badFetch, 0);

    const [a, b] = await Promise.all([
      t86.getDayMap("20260624"),
      margin.getDayMap("20260624"),
    ]);
    expect(a.get("1513")?.totalNet).toBe(7); // good source unaffected
    expect(b.size).toBe(0); // bad source degraded
  });

  it("memoises a failed day so a dead day is not re-hit on every read", async () => {
    const fetchDay = vi.fn(async () => {
      throw new Error("dead day");
    }) as unknown as BulkByDateFetcher<Flow>;
    const cache = new BulkByDateCache<Flow>(dataDir, "t86", fetchDay, 0);

    await cache.getDayMap("20260624");
    await cache.getDayMap("20260624");
    expect((fetchDay as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
