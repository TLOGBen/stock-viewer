import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  OfficialCloseCache,
  ONE_DAY_MS,
} from "../src/persistence/officialCloseCache.js";
import type { StockDayAllRow } from "../src/domain/index.js";

/** Build a fake `fetch` that returns `rows` as JSON and counts calls. */
function fakeFetch(rows: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => {
    return {
      ok,
      status,
      json: async () => rows,
    } as unknown as Response;
  });
  return fn as unknown as typeof fetch & { mock: { calls: unknown[] } };
}

const SAMPLE: StockDayAllRow[] = [
  { Code: "2330", Name: "台積電", ClosingPrice: "1000", Change: "5", TradeVolume: "20000000" },
  { Code: "2317", Name: "鴻海", ClosingPrice: "200", Change: "-1", TradeVolume: "5000000" },
];

describe("OfficialCloseCache", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "occ-test-"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("fetches once and indexes rows by Code", async () => {
    const fetchImpl = fakeFetch(SAMPLE);
    const cache = new OfficialCloseCache({ dataDir, url: "http://x", fetchImpl });

    const now = 1_000_000;
    const map = await cache.getMap(now);

    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
    expect(map.get("2330")?.ClosingPrice).toBe("1000");
    expect(map.get("2317")?.ClosingPrice).toBe("200");
    expect(cache.size).toBe(2);
    expect(cache.ageMs(now)).toBe(0);
  });

  it("reuses the cache within TTL (no second fetch)", async () => {
    const fetchImpl = fakeFetch(SAMPLE);
    const cache = new OfficialCloseCache({ dataDir, url: "http://x", fetchImpl });

    const t0 = 1_000_000;
    await cache.getMap(t0);
    await cache.getMap(t0 + ONE_DAY_MS - 1); // still inside TTL

    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
  });

  it("refetches when the cache is expired (age >= TTL)", async () => {
    const fetchImpl = fakeFetch(SAMPLE);
    const cache = new OfficialCloseCache({ dataDir, url: "http://x", fetchImpl });

    const t0 = 1_000_000;
    await cache.getMap(t0);
    await cache.getMap(t0 + ONE_DAY_MS); // exactly TTL → expired, refetch

    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(2);
  });

  it("atomically writes the cache file (tmp + rename) on success", async () => {
    const fetchImpl = fakeFetch(SAMPLE);
    const cache = new OfficialCloseCache({ dataDir, url: "http://x", fetchImpl });

    await cache.getMap(1_000_000);

    const raw = await fs.readFile(path.join(dataDir, "official-close.json"), "utf8");
    const parsed = JSON.parse(raw) as { fetchedAt: number; rows: StockDayAllRow[] };
    expect(parsed.fetchedAt).toBe(1_000_000);
    expect(parsed.rows).toHaveLength(2);

    // No stray tmp file left behind.
    const entries = await fs.readdir(dataDir);
    expect(entries.some((e) => e.endsWith(".tmp"))).toBe(false);
  });

  it("hydrates from disk on a fresh instance without fetching", async () => {
    const first = new OfficialCloseCache({ dataDir, url: "http://x", fetchImpl: fakeFetch(SAMPLE) });
    await first.getMap(1_000_000);

    const fetchImpl = fakeFetch(SAMPLE);
    const second = new OfficialCloseCache({ dataDir, url: "http://x", fetchImpl });
    const map = await second.getMap(1_000_000 + 1); // within TTL of persisted fetchedAt

    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(0);
    expect(map.get("2330")?.ClosingPrice).toBe("1000");
  });

  it("serves stale cache and never throws when a refetch fails", async () => {
    const ok = fakeFetch(SAMPLE);
    const cache = new OfficialCloseCache({ dataDir, url: "http://x", fetchImpl: ok });
    const t0 = 1_000_000;
    await cache.getMap(t0);

    // Swap in a failing fetch and force an expiry-driven refetch.
    const failing = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    (cache as unknown as { fetchImpl: typeof fetch }).fetchImpl = failing;

    const map = await cache.getMap(t0 + 2 * ONE_DAY_MS);
    expect(map.get("2330")?.ClosingPrice).toBe("1000"); // stale data preserved
  });

  it("returns an empty map (never throws) when first fetch fails with no cache", async () => {
    const failing = vi.fn(async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const cache = new OfficialCloseCache({ dataDir, url: "http://x", fetchImpl: failing });

    const map = await cache.getMap(1_000_000);
    expect(map.size).toBe(0);
    expect(cache.size).toBe(0);
  });

  it("treats a non-2xx response as failure and returns empty map (no cache)", async () => {
    const fetchImpl = fakeFetch([], false, 503);
    const cache = new OfficialCloseCache({ dataDir, url: "http://x", fetchImpl });

    const map = await cache.getMap(1_000_000);
    expect(map.size).toBe(0);
  });

  it("treats a non-array JSON body as empty rows (never throws)", async () => {
    const fetchImpl = fakeFetch({ unexpected: "shape" });
    const cache = new OfficialCloseCache({ dataDir, url: "http://x", fetchImpl });

    const map = await cache.getMap(1_000_000);
    expect(map.size).toBe(0);
  });

  it("reports Infinity age before any successful fetch", () => {
    const cache = new OfficialCloseCache({ dataDir, url: "http://x", fetchImpl: fakeFetch(SAMPLE) });
    expect(cache.ageMs(1_000_000)).toBe(Infinity);
  });
});
