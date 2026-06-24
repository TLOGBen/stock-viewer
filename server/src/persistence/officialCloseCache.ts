import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { StockDayAllRow } from "../domain/index.js";
import { createOfficialClient } from "../adapters/officialClient.js";

/**
 * Official-source fallback cache for the live feed (persistence layer).
 *
 * When the (undocumented) MIS real-time API is failing, we still want a symbol
 * to show an OFFICIAL number rather than nothing. The TWSE OpenAPI exposes only
 * daily close data (`STOCK_DAY_ALL`), so this cache fetches that once, persists
 * it on disk for ~1 day, and hands rows to the pure domain parser
 * (`parseStockDayAllRow`) which turns a row into a degraded `Quote` tagged
 * `source: "official-close"`.
 *
 * It is intentionally simple: one bulk endpoint (all listed/TSE securities in a
 * single response), an in-memory + on-disk cache with a 1-day retention window,
 * and never-throws semantics so a fallback fetch can never crash the feed.
 */

/** Default retention / freshness window: re-fetch official close at most once a day. */
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Cache file name under dataDir. */
const CACHE_FILE = "official-close.json";

/** On-disk cache envelope: the rows plus when they were fetched. */
interface CacheFile {
  fetchedAt: number;
  rows: StockDayAllRow[];
}

export interface OfficialFallbackConfig {
  /** Bulk daily-close endpoint (defaults to the same official URL as the universe). */
  url: string;
  /** Where to persist the cache file. */
  dataDir: string;
  /** Freshness window — refetch when the cache is older than this. */
  ttlMs: number;
}

/**
 * In-memory + on-disk cache of the official daily-close directory, keyed by
 * symbol. `getMap()` returns a fresh-or-stale map and NEVER throws: on a failed
 * fetch it serves the last good data (memory → disk), or an empty map.
 */
export class OfficialCloseCache {
  private memory: Map<string, StockDayAllRow> | null = null;
  private fetchedAt = 0;
  private readonly url: string;
  private readonly cachePath: string;
  private readonly ttlMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts?: Partial<OfficialFallbackConfig> & { fetchImpl?: typeof fetch }) {
    this.url = opts?.url ?? config.universeTwseUrl;
    this.cachePath = path.join(opts?.dataDir ?? config.dataDir, CACHE_FILE);
    this.ttlMs = opts?.ttlMs ?? ONE_DAY_MS;
    this.fetchImpl = opts?.fetchImpl ?? fetch;
  }

  /** Lazily load the on-disk cache into memory once (best-effort). */
  private async hydrateFromDisk(): Promise<void> {
    if (this.memory != null) return;
    try {
      const raw = await fs.readFile(this.cachePath, "utf8");
      const parsed = JSON.parse(raw) as CacheFile;
      if (Array.isArray(parsed.rows)) {
        this.memory = indexRows(parsed.rows);
        this.fetchedAt = typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0;
      }
    } catch {
      /* no cache yet / unreadable — fine, we'll fetch */
    }
  }

  private async persist(rows: StockDayAllRow[], fetchedAt: number): Promise<void> {
    const body: CacheFile = { fetchedAt, rows };
    const tmp = `${this.cachePath}.tmp`;
    try {
      await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
      await fs.writeFile(tmp, JSON.stringify(body), "utf8");
      await fs.rename(tmp, this.cachePath);
    } catch (err) {
      console.error("[official-fallback] cache write failed:", err);
      await fs.rm(tmp, { force: true }).catch(() => undefined);
    }
  }

  /**
   * Symbol → row map. Fresh memory cache → return it; else refetch and rewrite
   * the 1-day cache. On fetch failure, fall back to stale memory/disk, else an
   * empty map. Never throws.
   */
  async getMap(now: number): Promise<Map<string, StockDayAllRow>> {
    await this.hydrateFromDisk();

    if (this.memory != null && now - this.fetchedAt < this.ttlMs) {
      return this.memory;
    }

    try {
      // The network call lives in adapters/officialClient. Build it from the
      // current fetchImpl on each refetch so a runtime-swapped fetch (tests) is
      // honoured; the client throws on non-2xx/timeout and we serve stale below.
      const client = createOfficialClient(this.fetchImpl);
      const rows = await client.fetchStockDayAll(this.url);
      this.memory = indexRows(rows);
      this.fetchedAt = now;
      await this.persist(rows, now);
      return this.memory;
    } catch (err) {
      console.error("[official-fallback] fetch failed, serving cache:", err);
      return this.memory ?? new Map();
    }
  }

  /** Age of the cached data in ms (Infinity when never fetched). For health. */
  ageMs(now: number): number {
    return this.fetchedAt === 0 ? Infinity : now - this.fetchedAt;
  }

  /** Whether anything is cached. For health. */
  get size(): number {
    return this.memory?.size ?? 0;
  }
}

/** Index rows by their `Code`, dropping rows without a code. */
function indexRows(rows: StockDayAllRow[]): Map<string, StockDayAllRow> {
  const map = new Map<string, StockDayAllRow>();
  for (const r of rows) {
    if (r != null && typeof r === "object" && typeof r.Code === "string") {
      map.set(r.Code, r);
    }
  }
  return map;
}
