/**
 * usecase/ — application orchestration. Each usecase composes domain pure
 * functions with persistence stores and adapter clients (all injected by the
 * composition root). The action layer (HTTP routes, WS) calls into these and
 * only does request parsing / response serialization.
 */
export {
  TwseFeed,
  type CandleEvent,
  type TwseFeedEvents,
  type TwseFeedDeps,
} from "./quoteFeed.js";
export {
  UniverseProvider,
  type UniverseProviderConfig,
} from "./universeService.js";
export { getKlines, type GetKlinesDeps } from "./getKlines.js";
export {
  searchUniverse,
  listSecurities,
  resolveSecurity,
} from "./searchUniverse.js";
export {
  getWatchlist,
  setWatchlist,
  unknownSymbols,
  watchlistItems,
  type WatchlistView,
} from "./manageWatchlist.js";
export { getMarketStats, type GetMarketStatsDeps } from "./getMarketStats.js";
export {
  getHealth,
  rollupStatus,
  type GetHealthDeps,
  type FeedHealthSource,
  type UniverseHealthSource,
} from "./getHealth.js";
