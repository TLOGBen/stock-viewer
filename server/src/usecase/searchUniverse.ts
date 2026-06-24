import type { Security, UniverseSnapshot } from "../domain/index.js";
import type { UniverseProvider } from "./universeService.js";
import type { RankedSecurity } from "../universe/searchIndex.js";

/**
 * usecase/searchUniverse — read-side queries over the securities universe.
 * Thin orchestration over the injected `UniverseProvider` so the action layer
 * only parses the request and serializes the result.
 */

/** Ranked fuzzy search over the universe directory. */
export function searchUniverse(
  provider: UniverseProvider,
  q: string,
  limit?: number,
): RankedSecurity[] {
  return provider.search(q, limit);
}

/** Full universe snapshot (securities + freshness metadata) for /securities. */
export function listSecurities(provider: UniverseProvider): UniverseSnapshot {
  return provider.snapshot();
}

/** Resolve a single symbol's directory row, or undefined when unknown. */
export function resolveSecurity(
  provider: UniverseProvider,
  symbol: string,
): Security | undefined {
  return provider.get(symbol);
}
