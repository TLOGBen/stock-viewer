/**
 * Barrel re-export — the official daily-close (`STOCK_DAY_ALL`) fallback cache
 * now lives in `persistence/officialCloseCache.ts`, and the pure row → Quote
 * parser lives in `domain/officialClose.ts`. Kept here so existing
 * `./officialFallback.js` import sites (e.g. twseFeed) keep compiling during the
 * layered refactor. New code should import from `./persistence/index.js`
 * (cache) and `./domain/index.js` (parser).
 */
export {
  OfficialCloseCache,
  ONE_DAY_MS,
} from "./persistence/officialCloseCache.js";
export type { OfficialFallbackConfig } from "./persistence/officialCloseCache.js";
export { parseStockDayAllRow } from "./domain/officialClose.js";
export type { StockDayAllRow } from "./domain/officialClose.js";
