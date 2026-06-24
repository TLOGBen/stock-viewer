/**
 * persistence/ — repository / cache implementations (disk + in-memory). These
 * depend inward on domain/ types and pure functions only. Outer layers (usecase,
 * action, the composition root) import the stores from this barrel.
 */
export { CandleStore } from "./candleStore.js";
export type { CandleUpdate, IntradayInterval } from "./candleStore.js";
export { HistoryCache, rollupDaily } from "./historyCache.js";
export { WatchlistStore } from "./watchlistStore.js";
export {
  readUniverseCache,
  writeUniverseCache,
  isFresh,
} from "./universeCache.js";
export { OfficialCloseCache, ONE_DAY_MS } from "./officialCloseCache.js";
export type { OfficialFallbackConfig } from "./officialCloseCache.js";
