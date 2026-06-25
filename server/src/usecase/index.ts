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
export { fetchDailyCandles } from "./fetchHistory.js";
export {
  getHealth,
  rollupStatus,
  type GetHealthDeps,
  type FeedHealthSource,
  type UniverseHealthSource,
} from "./getHealth.js";

// ── 個股頁 (stock-page) usecases — injected stock-page deps ──
export {
  type StockPageDeps,
  type InstitutionalCache,
  type MarginCache,
  type ValuationCache,
  type ExRightCache,
  type RevenueCache,
  type CompanyFetcher,
  type FinancialsByVariantFetcher,
  type BalanceByVariantFetcher,
  type DividendSeriesFetcher,
  DEFAULT_RECENT_DAYS,
  VALUATION_WINDOW_DAYS,
  FINANCIAL_VARIANTS,
} from "./stockPageDeps.js";
export { getCompany, type GetCompanyDeps, type CompanyView } from "./getCompany.js";
export { getRevenue, type GetRevenueDeps, type RevenueView } from "./getRevenue.js";
export {
  getFinancials,
  type GetFinancialsDeps,
  type FinancialsView,
} from "./getFinancials.js";
export {
  getDividends,
  type GetDividendsDeps,
  type DividendsView,
} from "./getDividends.js";
export {
  getInstitutional,
  type GetInstitutionalDeps,
  type InstitutionalDay,
  type InstitutionalView,
} from "./getInstitutional.js";
export {
  getMargin,
  type GetMarginDeps,
  type MarginDay,
  type MarginView,
} from "./getMargin.js";
export {
  getValuation,
  type GetValuationDeps,
  type ValuationDay,
  type ValuationView,
} from "./getValuation.js";
export {
  getHealthLights,
  type GetHealthLightsDeps,
} from "./getHealthLights.js";
export {
  getDisclosures,
  type GetDisclosuresDeps,
  type DisclosuresView,
} from "./getDisclosures.js";
