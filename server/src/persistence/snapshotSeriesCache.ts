import { promises as fs } from "node:fs";
import path from "node:path";
import { upsertSeries } from "../domain/index.js";

/**
 * persistence/snapshotSeriesCache — infrastructure B: a per-symbol, append-over-
 * time series cache (月營收 / EPS / 股利 / 資產負債). The opendata directory
 * endpoints only ever return the LATEST period for the whole market, so a
 * stock's history is built by folding each fresh snapshot into a per-symbol,
 * key-deduplicated, capped series.
 *
 * Per review R5 this is deliberately a CONCRETE cache, not a pre-abstracted
 * generic; what it shares with future series caches is exactly one pure domain
 * primitive — `upsertSeries` — not a class. It is generic over the item type T
 * only so one source's items are stored per file.
 *
 * Layering: depends only inward. The network call lives in `adapters/`; the
 * per-symbol fetcher (returning the latest domain-typed item, or null when the
 * symbol is absent in the snapshot) is INJECTED by the composition root.
 *
 * Invariants (CLAUDE.md persistence layer):
 *   • never throws from getSeries — read failures degrade to [].
 *   • atomic writes (tmp + rename); a write failure logs and continues.
 *   • cachePath() is a 1:1 port of historyCache's path-traversal guard: the
 *     resolved file MUST sit directly inside the cache dir, so a crafted symbol
 *     ("../../watchlist", "a/b", …) can never escape — even if a caller skipped
 *     the REST-layer symbol validation.
 */

/** Persisted per-symbol series envelope. */
interface SeriesFile<T> {
  asOf: number; // epoch ms the series was last updated
  items: T[];
}

/** A persisted value is structurally a SeriesFile. */
function isSeriesFile<T>(v: unknown): v is SeriesFile<T> {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o["asOf"] === "number" && Array.isArray(o["items"]);
}

/**
 * Injected per-symbol latest-snapshot fetcher. Returns the newest domain-typed
 * item for `symbol`, or null when the symbol is absent from the snapshot.
 * Declared here so the cache never reaches into adapters. May throw — callers
 * of upsertLatest decide whether to wrap it.
 */
export type LatestItemFetcher<T> = (symbol: string) => Promise<T | null>;

/**
 * Cache-first per-symbol series store for ONE source. One instance per source;
 * reads/writes {dataDir}/{subDir}/{symbol}.json.
 */
export class SnapshotSeriesCache<T> {
  private readonly dataDir: string;
  private readonly subDir: string;
  private readonly keyFn: (item: T) => string;
  private readonly cap: number;
  private readonly fetchLatest: LatestItemFetcher<T>;

  /**
   * @param keyFn  series de-dup key (e.g. revenue → yearMonth, EPS → period).
   * @param cap    max retained periods; series trims from the front (oldest).
   */
  constructor(
    dataDir: string,
    subDir: string,
    keyFn: (item: T) => string,
    cap: number,
    fetchLatest: LatestItemFetcher<T>,
  ) {
    this.dataDir = dataDir;
    this.subDir = subDir;
    this.keyFn = keyFn;
    this.cap = cap;
    this.fetchLatest = fetchLatest;
  }

  /** Absolute path to this source's sub-directory. */
  private seriesDir(): string {
    return path.join(this.dataDir, this.subDir);
  }

  /**
   * Absolute path to one symbol's series file. Defense-in-depth against path
   * traversal (1:1 port of historyCache.cachePath): the resolved file MUST sit
   * directly inside seriesDir, so a crafted symbol can never escape the dir.
   */
  private cachePath(symbol: string): string {
    const dir = path.resolve(this.seriesDir());
    const target = path.resolve(dir, `${symbol}.json`);
    if (path.dirname(target) !== dir) {
      throw new Error(
        `[snapshotSeriesCache] illegal symbol path: ${JSON.stringify(symbol)}`,
      );
    }
    return target;
  }

  /** Read a symbol's series file, or null when absent/unreadable/malformed. */
  private async read(symbol: string): Promise<SeriesFile<T> | null> {
    try {
      const raw = await fs.readFile(this.cachePath(symbol), "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!isSeriesFile<T>(parsed)) {
        console.error(`[snapshotSeriesCache] ${this.subDir}/${symbol}.json malformed`);
        return null;
      }
      return parsed;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.error(`[snapshotSeriesCache] read ${this.subDir}/${symbol} failed:`, err);
      }
      return null;
    }
  }

  /** Atomically persist a symbol's series (tmp file + rename). */
  private async write(symbol: string, file: SeriesFile<T>): Promise<void> {
    const dir = this.seriesDir();
    await fs.mkdir(dir, { recursive: true });
    const target = this.cachePath(symbol);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(file), "utf8");
      await fs.rename(tmp, target);
    } catch (err) {
      console.error(`[snapshotSeriesCache] write ${this.subDir}/${symbol} failed:`, err);
      await fs.rm(tmp, { force: true }).catch(() => undefined);
    }
  }

  /**
   * Return the persisted series for `symbol`, ascending as stored. Never throws
   * — missing/unreadable → []. A traversal-illegal symbol surfaces as an empty
   * series (the guard throw is caught here, not propagated to the caller).
   */
  async getSeries(symbol: string): Promise<T[]> {
    try {
      const file = await this.read(symbol);
      return file?.items ?? [];
    } catch (err) {
      console.error(`[snapshotSeriesCache] getSeries ${symbol} failed:`, err);
      return [];
    }
  }

  /**
   * Fetch the latest snapshot for `symbol`, fold it into the persisted series
   * via the pure domain `upsertSeries` (de-dup by key, cap from the front), and
   * persist atomically. Returns the resulting series. When the fetch yields null
   * (symbol absent in the snapshot) the existing series is returned untouched.
   * Throws only if the injected fetcher rejects AND the caller did not wrap it;
   * the usecase layer wraps this in try/catch per the never-throw contract.
   */
  async upsertLatest(symbol: string): Promise<T[]> {
    const existing = await this.getSeries(symbol);
    const latest = await this.fetchLatest(symbol);
    if (latest == null) return existing;

    const next = upsertSeries(existing, latest, this.keyFn, this.cap);
    await this.write(symbol, { asOf: Date.now(), items: next });
    return next;
  }
}
