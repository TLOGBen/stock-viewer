/**
 * Barrel re-export — the cache-first daily K-line store and pure roll-up now
 * live in `persistence/`. Kept here so existing `./historyCache.js` import sites
 * keep compiling during the layered refactor. New code should import from
 * `./persistence/index.js`.
 */
export { HistoryCache, rollupDaily } from "./persistence/historyCache.js";
