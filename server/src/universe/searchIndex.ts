import type { Security } from "../types.js";

/**
 * Pure search index over the securities universe. No deps, no I/O.
 *
 * Ranking (lower rank = better):
 *   0  exact code match
 *   1  code startsWith query
 *   2  name startsWith query
 *   3  name includes query
 * Query is normalized (trim; uppercased for the code comparisons). An empty
 * query yields []. limit defaults to 20 and is capped at 50.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface RankedSecurity extends Security {
  rank: number;
}

export interface SearchIndex {
  bySymbol: Map<string, Security>;
  search(q: string, limit?: number): RankedSecurity[];
  all(): Security[];
}

/** Rank one security against a normalized query, or null when it doesn't match. */
function rankOf(
  sec: Security,
  codeQuery: string,
  nameQuery: string,
): number | null {
  const code = sec.symbol.toUpperCase();
  if (code === codeQuery) return 0;
  if (code.startsWith(codeQuery)) return 1;
  const name = sec.name.toLowerCase();
  if (name.startsWith(nameQuery)) return 2;
  if (name.includes(nameQuery)) return 3;
  return null;
}

/** Build an immutable search index. The input array is not mutated. */
export function buildSearchIndex(securities: Security[]): SearchIndex {
  const securitiesCopy = [...securities];
  const bySymbol = new Map<string, Security>();
  for (const sec of securitiesCopy) {
    if (!bySymbol.has(sec.symbol)) bySymbol.set(sec.symbol, sec);
  }

  function clampLimit(limit: number | undefined): number {
    const n = limit ?? DEFAULT_LIMIT;
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
    return Math.min(Math.trunc(n), MAX_LIMIT);
  }

  function search(q: string, limit?: number): RankedSecurity[] {
    const trimmed = q.trim();
    if (trimmed === "") return [];
    const codeQuery = trimmed.toUpperCase();
    const nameQuery = trimmed.toLowerCase();
    const cap = clampLimit(limit);

    const matches: RankedSecurity[] = [];
    for (const sec of securitiesCopy) {
      const rank = rankOf(sec, codeQuery, nameQuery);
      if (rank != null) matches.push({ ...sec, rank });
    }
    // Stable secondary sort by symbol so equal-rank results are deterministic.
    matches.sort((a, b) =>
      a.rank !== b.rank
        ? a.rank - b.rank
        : a.symbol < b.symbol
          ? -1
          : a.symbol > b.symbol
            ? 1
            : 0,
    );
    return matches.slice(0, cap);
  }

  function all(): Security[] {
    return [...securitiesCopy];
  }

  return { bySymbol, search, all };
}
