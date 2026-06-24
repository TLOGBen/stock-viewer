/**
 * Barrel re-export — the persistent watchlist store now lives in
 * `persistence/`. Kept here so existing `./watchlist/store.js` import sites keep
 * compiling during the layered refactor. New code should import from
 * `../persistence/index.js`.
 */
export { WatchlistStore } from "../persistence/watchlistStore.js";
