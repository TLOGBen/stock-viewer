import type { Security, UniverseSnapshot } from "../types.js";
import { fetchUniverse } from "./sources.js";
import {
  readUniverseCache,
  writeUniverseCache,
  isFresh,
} from "./cache.js";
import {
  buildSearchIndex,
  type SearchIndex,
  type RankedSecurity,
} from "./searchIndex.js";

/**
 * Owns the in-memory securities universe + its search index, with a
 * cache-first load and a stale-on-failure fallback.
 *
 *   load(): fresh cache → use it; else fetch → write cache; on fetch failure
 *           fall back to (stale) cache with stale=true; if nothing at all,
 *           an empty universe (stale=true).
 *   refresh(): force a fetch and rewrite the cache (used by the daily timer).
 */
export interface UniverseProviderConfig {
  dataDir: string;
  universeTwseUrl: string;
  universeTpexUrl: string;
  universeTtlMs: number;
}

export class UniverseProvider {
  private index: SearchIndex = buildSearchIndex([]);
  public asOf = 0;
  public stale = true;

  /** Cache-first load. Never throws — degrades to stale/empty on total failure. */
  async load(cfg: UniverseProviderConfig): Promise<void> {
    const now = Date.now();
    const cached = await readUniverseCache(cfg.dataDir);

    if (cached != null && isFresh(cached.asOf, cfg.universeTtlMs, now)) {
      this.apply(cached.securities, cached.asOf, cached.stale);
      return;
    }

    try {
      const securities = await fetchUniverse(cfg);
      const snapshot: UniverseSnapshot = {
        asOf: now,
        stale: false,
        securities,
      };
      await writeUniverseCache(cfg.dataDir, snapshot).catch((err) =>
        console.error("[universe] cache write failed:", err),
      );
      this.apply(securities, now, false);
    } catch (err) {
      console.error("[universe] fetch failed, falling back to cache:", err);
      if (cached != null) {
        this.apply(cached.securities, cached.asOf, true);
      } else {
        this.apply([], now, true);
      }
    }
  }

  /** Force-refresh from the network and rewrite the cache. Never throws. */
  async refresh(cfg: UniverseProviderConfig): Promise<void> {
    const now = Date.now();
    try {
      const securities = await fetchUniverse(cfg);
      const snapshot: UniverseSnapshot = {
        asOf: now,
        stale: false,
        securities,
      };
      await writeUniverseCache(cfg.dataDir, snapshot).catch((err) =>
        console.error("[universe] cache write failed:", err),
      );
      this.apply(securities, now, false);
    } catch (err) {
      console.error("[universe] refresh failed, keeping current set:", err);
      this.stale = true;
    }
  }

  /** Replace the in-memory set + rebuild the index immutably. */
  private apply(securities: Security[], asOf: number, stale: boolean): void {
    this.index = buildSearchIndex(securities);
    this.asOf = asOf;
    this.stale = stale;
  }

  search(q: string, limit?: number): RankedSecurity[] {
    return this.index.search(q, limit);
  }

  get(symbol: string): Security | undefined {
    return this.index.bySymbol.get(symbol);
  }

  all(): Security[] {
    return this.index.all();
  }

  snapshot(): UniverseSnapshot {
    return { asOf: this.asOf, stale: this.stale, securities: this.all() };
  }
}
