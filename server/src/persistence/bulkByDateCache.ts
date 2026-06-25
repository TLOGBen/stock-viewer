import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * persistence/bulkByDateCache — infrastructure A: a by-date, whole-market
 * snapshot accumulation layer that feeds the per-stock 法人 / 融資融券 / 河流圖 /
 * 除權息 views. The official rwd reports only ever expose ONE trading day's
 * whole-market data per call, so a stock's history is built by accumulating one
 * file per trading day and reading the slice for the symbol we need.
 *
 * Layering: this cache depends ONLY inward. The network call lives in
 * `adapters/`; the fetcher is INJECTED by the composition root (never imported
 * here — deliberately NOT the officialCloseCache "import adapter" anti-pattern).
 * The injected `BulkByDateFetcher` returns a domain-typed `Map<code, row>` for a
 * given "YYYYMMDD" date.
 *
 * Invariants (CLAUDE.md persistence layer):
 *   • never throws — read failures degrade to an empty Map, write failures log
 *     and continue. A single source failing one day never blocks the rest.
 *   • old day files are IMMUTABLE — once a trading day is persisted it is never
 *     rewritten (the whole-market report for a past day does not change).
 *   • atomic writes — tmp file + rename.
 */

/**
 * Injected per-trading-day whole-market fetcher. Given a "YYYYMMDD" date it
 * returns a domain-typed map keyed by the security code (e.g. T86 → a map of
 * code → InstitutionalFlow). Declared HERE (persistence) so the cache never
 * reaches into adapters; the composition root wires an adapter + domain parser
 * into a function of this shape. May throw / reject on a bad day — the cache
 * catches every call.
 */
export type BulkByDateFetcher<T> = (date: string) => Promise<Map<string, T>>;

/** Minimum gap between two real fetches during a backfill sweep. */
export const BACKFILL_THROTTLE_MS = 350;

/** On-disk envelope for one trading day's whole-market slice for this source. */
interface DayFile<T> {
  /** "YYYYMMDD" trading day this file is for. */
  date: string;
  /** epoch ms the rows were sourced. */
  fetchedAt: number;
  /** [code, row] pairs (a Map is not JSON-serialisable directly). */
  entries: [string, T][];
}

/** A persisted value is structurally a DayFile. */
function isDayFile<T>(v: unknown): v is DayFile<T> {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o["date"] === "string" && Array.isArray(o["entries"]);
}

/**
 * Cache-first whole-market by-date store for ONE source. One instance per
 * source (法人 / 融資融券 / …); reads/writes {dataDir}/{subDir}/{date}.json.
 * Never throws from any public method.
 */
export class BulkByDateCache<T> {
  private readonly dataDir: string;
  private readonly subDir: string;
  private readonly fetchDay: BulkByDateFetcher<T>;
  private readonly throttleMs: number;
  /** In-memory hits for already-loaded days (date → map). */
  private readonly memory = new Map<string, Map<string, T>>();

  constructor(
    dataDir: string,
    subDir: string,
    fetchDay: BulkByDateFetcher<T>,
    throttleMs: number = BACKFILL_THROTTLE_MS,
  ) {
    this.dataDir = dataDir;
    this.subDir = subDir;
    this.fetchDay = fetchDay;
    this.throttleMs = throttleMs;
  }

  /** Absolute path to this source's sub-directory. */
  private dir(): string {
    return path.join(this.dataDir, this.subDir);
  }

  /**
   * Absolute path to one trading day's file. The `date` is a "YYYYMMDD" string
   * that never reaches this method un-sanitised in practice, but defend in
   * depth: the resolved file MUST sit directly inside the source dir.
   */
  private filePath(date: string): string {
    const dir = path.resolve(this.dir());
    const target = path.resolve(dir, `${date}.json`);
    if (path.dirname(target) !== dir) {
      throw new Error(
        `[bulkByDateCache] illegal date path: ${JSON.stringify(date)}`,
      );
    }
    return target;
  }

  /** Read one day file from disk, or null when absent/unreadable/malformed. */
  private async readDisk(date: string): Promise<Map<string, T> | null> {
    let target: string;
    try {
      target = this.filePath(date);
    } catch (err) {
      console.error(`[bulkByDateCache] ${this.subDir} bad date ${date}:`, err);
      return null;
    }
    try {
      const raw = await fs.readFile(target, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!isDayFile<T>(parsed)) {
        console.error(`[bulkByDateCache] ${this.subDir}/${date}.json malformed`);
        return null;
      }
      return new Map(parsed.entries);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.error(`[bulkByDateCache] read ${this.subDir}/${date} failed:`, err);
      }
      return null;
    }
  }

  /** Atomically persist one trading day's slice (tmp file + rename). */
  private async write(date: string, map: Map<string, T>): Promise<void> {
    const dir = this.dir();
    await fs.mkdir(dir, { recursive: true });
    const target = this.filePath(date);
    const file: DayFile<T> = {
      date,
      fetchedAt: Date.now(),
      entries: [...map.entries()],
    };
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(file), "utf8");
      await fs.rename(tmp, target);
    } catch (err) {
      console.error(`[bulkByDateCache] write ${this.subDir}/${date} failed:`, err);
      await fs.rm(tmp, { force: true }).catch(() => undefined);
    }
  }

  /**
   * Return the whole-market map for `date` (a "YYYYMMDD" trading day). Memory
   * hit → return it; on-disk file → load it (a past day's report is immutable,
   * so a present file is authoritative and never re-fetched); otherwise fetch
   * once, persist, and memoise. NEVER throws — any failure degrades to an empty
   * Map. A source that fails for one day does not affect the others.
   */
  async getDayMap(date: string): Promise<Map<string, T>> {
    const mem = this.memory.get(date);
    if (mem != null) return mem;

    const disk = await this.readDisk(date);
    if (disk != null) {
      this.memory.set(date, disk);
      return disk;
    }

    try {
      const map = await this.fetchDay(date);
      this.memory.set(date, map);
      await this.write(date, map);
      return map;
    } catch (err) {
      console.error(`[bulkByDateCache] fetch ${this.subDir}/${date} failed:`, err);
      const empty = new Map<string, T>();
      // Memoise the empty result so a dead day is not re-hit every read.
      this.memory.set(date, empty);
      return empty;
    }
  }

  /**
   * Return the day maps for the given list of trading days (newest-first in,
   * newest-first out), skipping any day that resolves to an empty map. Each day
   * is fetched/read independently so one bad day never drops the rest. NEVER
   * throws. Between two REAL fetches (not memory/disk hits) the sweep throttles
   * by `throttleMs` to stay polite to the upstream endpoint.
   */
  async getRecentDays(
    dates: readonly string[],
  ): Promise<{ date: string; map: Map<string, T> }[]> {
    const out: { date: string; map: Map<string, T> }[] = [];
    for (const date of dates) {
      const hadMemory = this.memory.has(date);
      const hadDisk = !hadMemory && (await this.diskExists(date));
      const map = await this.getDayMap(date);
      if (map.size > 0) out.push({ date, map });
      // Only throttle after a real network fetch (cold day), not cache hits.
      if (!hadMemory && !hadDisk && this.throttleMs > 0) {
        await delay(this.throttleMs);
      }
    }
    return out;
  }

  /** Cheap existence probe used to decide whether a getDayMap will hit network. */
  private async diskExists(date: string): Promise<boolean> {
    let target: string;
    try {
      target = this.filePath(date);
    } catch {
      return false;
    }
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }
}

/** Promise-based delay used for backfill throttling. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
