import { promises as fs } from "node:fs";
import path from "node:path";
import type { Candle } from "./types.js";
import { fetchDailyCandles, type Exch } from "./historyFetcher.js";

/**
 * Cache-first daily K-line store + pure weekly/monthly roll-up.
 *
 *   getDaily(symbol, exch): read {dataDir}/klines/{symbol}.json; when missing or
 *     stale (asOf older than ~6h) re-fetch ~14 months of STOCK_DAY and rewrite
 *     atomically. On fetch failure, serve the stale cache if present, else [].
 *   rollupDaily(daily, 'W'|'M'): pure aggregation of ascending daily candles
 *     into ISO-week (Monday-based) or calendar-month bars.
 */

/** Re-fetch when the cached snapshot is older than this (~6 hours). */
const STALE_MS = 6 * 60 * 60 * 1000;

/** Backfill window passed to the fetcher on a cache miss/refresh. */
const MONTHS_BACK = 14;

/** Sub-directory under dataDir holding per-symbol daily caches. */
const KLINES_DIR = "klines";

/** Persisted per-symbol daily snapshot. */
interface DailyCacheFile {
  asOf: number; // epoch ms the candles were sourced
  candles: Candle[];
}

/** A persisted file is structurally a DailyCacheFile. */
function isDailyCacheFile(v: unknown): v is DailyCacheFile {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o["asOf"] === "number" && Array.isArray(o["candles"]);
}

/**
 * Group ascending daily candles into W (ISO Monday-based week) or M (calendar
 * month) bars. Pure, no I/O. Each group folds to one Candle:
 *   timestamp = first day's timestamp, open = first open, high = max high,
 *   low = min low, close = last close, volume = sum of volumes.
 */
export function rollupDaily(
  daily: readonly Candle[],
  interval: "W" | "M",
): Candle[] {
  const groups = new Map<number, Candle[]>();
  const order: number[] = [];

  for (const candle of daily) {
    const key =
      interval === "W"
        ? isoWeekKey(candle.timestamp)
        : calendarMonthKey(candle.timestamp);
    const bucket = groups.get(key);
    if (bucket == null) {
      groups.set(key, [candle]);
      order.push(key);
    } else {
      bucket.push(candle);
    }
  }

  const out: Candle[] = [];
  for (const key of order) {
    const bucket = groups.get(key);
    if (bucket == null || bucket.length === 0) continue;
    out.push(foldGroup(bucket));
  }
  // Daily input is ascending, but sort defensively so output is stable.
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

/** Fold an ascending group of daily candles into a single OHLCV bar. */
function foldGroup(group: readonly Candle[]): Candle {
  const first = group[0]!;
  const last = group[group.length - 1]!;
  let high = first.high;
  let low = first.low;
  let volume = 0;
  for (const c of group) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
    volume += c.volume;
  }
  return {
    timestamp: first.timestamp,
    open: first.open,
    high,
    low,
    close: last.close,
    volume,
  };
}

/**
 * ISO-week key: a stable integer identifying the Monday-based week containing
 * `timestamp`. Computed as the epoch ms of that week's Monday (UTC midnight),
 * so candles in the same week share a key and weeks sort chronologically.
 */
function isoWeekKey(timestamp: number): number {
  const d = new Date(timestamp);
  // getUTCDay: 0=Sun..6=Sat. Shift so Monday=0 .. Sunday=6.
  const dow = (d.getUTCDay() + 6) % 7;
  const mondayUtc = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - dow,
  );
  return mondayUtc;
}

/** Calendar-month key: year * 12 + month, monotonic and group-stable. */
function calendarMonthKey(timestamp: number): number {
  const d = new Date(timestamp);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/**
 * Cache-first daily candle store. One instance per process; reads/writes
 * {dataDir}/klines/{symbol}.json. Never throws from getDaily — degrades to
 * stale cache or [].
 */
export class HistoryCache {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  /** Absolute path to the klines sub-directory. */
  private klinesDir(): string {
    return path.join(this.dataDir, KLINES_DIR);
  }

  /**
   * Absolute path to one symbol's daily cache file. Defense-in-depth against
   * path traversal: the resolved file MUST sit directly inside klinesDir, so a
   * crafted symbol ("../../watchlist", "a/b", …) can never escape the cache dir
   * even if a caller skipped the REST-layer symbol validation.
   */
  private cachePath(symbol: string): string {
    const dir = path.resolve(this.klinesDir());
    const target = path.resolve(dir, `${symbol}.json`);
    if (path.dirname(target) !== dir) {
      throw new Error(`[historyCache] illegal symbol path: ${JSON.stringify(symbol)}`);
    }
    return target;
  }

  /** Read a symbol's cache, or null when absent/unreadable/malformed. */
  private async read(symbol: string): Promise<DailyCacheFile | null> {
    try {
      const raw = await fs.readFile(this.cachePath(symbol), "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!isDailyCacheFile(parsed)) {
        console.error(`[historyCache] ${symbol}.json malformed, ignoring`);
        return null;
      }
      return parsed;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.error(`[historyCache] read ${symbol} failed:`, err);
      }
      return null;
    }
  }

  /** Atomically persist a symbol's daily snapshot (tmp file + rename). */
  private async write(symbol: string, file: DailyCacheFile): Promise<void> {
    const dir = this.klinesDir();
    await fs.mkdir(dir, { recursive: true });
    const target = this.cachePath(symbol);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    const body = JSON.stringify(file);
    try {
      await fs.writeFile(tmp, body, "utf8");
      await fs.rename(tmp, target);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw err;
    }
  }

  /**
   * Return ascending daily Candles for `symbol`. Fresh cache → use it; stale or
   * missing → fetch + rewrite; fetch failure → stale cache if present, else [].
   */
  async getDaily(symbol: string, exch: Exch): Promise<Candle[]> {
    const now = Date.now();
    const cached = await this.read(symbol);

    if (cached != null && now - cached.asOf < STALE_MS) {
      return cached.candles;
    }

    try {
      const candles = await fetchDailyCandles(symbol, exch, MONTHS_BACK);
      // An empty fetch (e.g. otc) should not clobber a usable stale cache.
      if (candles.length === 0 && cached != null) {
        return cached.candles;
      }
      const file: DailyCacheFile = { asOf: now, candles };
      await this.write(symbol, file).catch((err) =>
        console.error(`[historyCache] write ${symbol} failed:`, err),
      );
      return candles;
    } catch (err) {
      console.error(
        `[historyCache] fetch ${symbol} failed, serving stale:`,
        err,
      );
      return cached != null ? cached.candles : [];
    }
  }
}
