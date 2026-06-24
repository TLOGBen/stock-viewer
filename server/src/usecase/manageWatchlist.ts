import type { Security } from "../domain/index.js";
import type { WatchlistStore } from "../persistence/index.js";
import type { UniverseProvider } from "./universeService.js";

/**
 * usecase/manageWatchlist — read/replace the persisted watchlist, resolving each
 * symbol to a Security row. Orchestrates the watchlist store + universe provider
 * so the action layer only validates the request body and serializes the view.
 */

/** A watchlist view: the symbols, when it changed, and resolved rows. */
export interface WatchlistView {
  symbols: string[];
  updatedAt: number;
  items: Security[];
}

/**
 * Resolve watchlist symbols to Security rows. Every persisted symbol gets a row
 * — unknown ones (e.g. a fresh IPO not yet in the daily directory, or a failed
 * universe load) fall back to a minimal row rather than silently vanishing.
 */
export function watchlistItems(
  symbols: string[],
  provider: UniverseProvider,
): Security[] {
  return symbols.map(
    (sym) =>
      provider.get(sym) ?? {
        symbol: sym,
        name: sym,
        exch: "tse",
        type: "stock",
      },
  );
}

/** Current watchlist view. */
export function getWatchlist(
  watchlist: WatchlistStore,
  provider: UniverseProvider,
): WatchlistView {
  const symbols = watchlist.get();
  return {
    symbols,
    updatedAt: watchlist.updatedAtMs(),
    items: watchlistItems(symbols, provider),
  };
}

/** Symbols in `requested` that the universe does not recognize. */
export function unknownSymbols(
  requested: string[],
  provider: UniverseProvider,
): string[] {
  return requested.filter((s) => provider.get(s) == null);
}

/** Persist a new watchlist and return its resolved view. */
export async function setWatchlist(
  watchlist: WatchlistStore,
  provider: UniverseProvider,
  requested: string[],
): Promise<WatchlistView> {
  await watchlist.set(requested);
  return getWatchlist(watchlist, provider);
}
