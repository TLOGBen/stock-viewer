import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { HistoryCache } from "../src/persistence/index.js";
import type { Candle, Exch } from "../src/domain/index.js";

/**
 * getDaily cache policy (HUNT-2026-001): an EMPTY cached series must be treated
 * as stale so a poisoned/transient empty self-heals on the next view, and an
 * empty fetch must never be persisted. Regression guard for 8299 showing
 * "無日K資料（上櫃）" for 6h after a pre-fix empty was cached.
 */

const BAR: Candle = {
  timestamp: Date.UTC(2026, 5, 1),
  open: 100,
  high: 110,
  low: 95,
  close: 105,
  volume: 10,
};

function candleFile(asOf: number, candles: Candle[]): string {
  return JSON.stringify({ asOf, candles });
}

describe("HistoryCache.getDaily — empty-cache policy", () => {
  let dataDir: string;
  let klinesDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "histcache-test-"));
    klinesDir = path.join(dataDir, "klines");
    await fs.mkdir(klinesDir, { recursive: true });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  async function writeCache(symbol: string, asOf: number, candles: Candle[]) {
    await fs.writeFile(
      path.join(klinesDir, `${symbol}.json`),
      candleFile(asOf, candles),
      "utf8",
    );
  }

  async function readCacheRaw(symbol: string): Promise<unknown | null> {
    try {
      return JSON.parse(
        await fs.readFile(path.join(klinesDir, `${symbol}.json`), "utf8"),
      );
    } catch {
      return null;
    }
  }

  it("REFETCHES when the cache is FRESH but EMPTY (the bug) — self-heals", async () => {
    // A fresh (now) but empty cache — exactly the 8299 09:57 poison.
    await writeCache("8299", Date.now(), []);
    const fetcher = vi.fn(async (): Promise<Candle[]> => [BAR]);

    const cache = new HistoryCache(dataDir, fetcher as never);
    const out = await cache.getDaily("8299", "otc" as Exch);

    expect(fetcher).toHaveBeenCalledOnce(); // old code would have skipped this
    expect(out).toEqual([BAR]);
    // And the recovered data is now persisted.
    const onDisk = (await readCacheRaw("8299")) as { candles: Candle[] };
    expect(onDisk.candles).toEqual([BAR]);
  });

  it("serves a FRESH NON-EMPTY cache without fetching", async () => {
    await writeCache("2330", Date.now(), [BAR]);
    const fetcher = vi.fn(async (): Promise<Candle[]> => []);

    const cache = new HistoryCache(dataDir, fetcher as never);
    const out = await cache.getDaily("2330", "tse" as Exch);

    expect(fetcher).not.toHaveBeenCalled();
    expect(out).toEqual([BAR]);
  });

  it("NEVER persists an empty fetch result (no cache poisoning)", async () => {
    const fetcher = vi.fn(async (): Promise<Candle[]> => []);
    const cache = new HistoryCache(dataDir, fetcher as never);

    const out = await cache.getDaily("9999", "otc" as Exch);

    expect(out).toEqual([]);
    expect(await readCacheRaw("9999")).toBeNull(); // no file written
  });

  it("does not clobber a usable cache when a later fetch returns empty", async () => {
    // Stale (old) non-empty cache + a fetch that now returns empty → keep cached.
    const old = Date.now() - 7 * 60 * 60 * 1000; // > 6h STALE_MS
    await writeCache("2317", old, [BAR]);
    const fetcher = vi.fn(async (): Promise<Candle[]> => []);

    const cache = new HistoryCache(dataDir, fetcher as never);
    const out = await cache.getDaily("2317", "tse" as Exch);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(out).toEqual([BAR]); // fell back to prior candles
  });
});
