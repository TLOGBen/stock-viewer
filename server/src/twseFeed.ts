/**
 * Barrel re-export — the live-feed orchestration (`TwseFeed`) now lives in
 * `usecase/quoteFeed.ts`. The pure helpers that normalize the MIS payload live
 * in `domain/` (mis.ts, market.ts). Both are re-exported here so existing
 * `./twseFeed.js` import sites (and tests) keep compiling during the layered
 * refactor. New code should import from `./usecase/quoteFeed.js` (orchestration)
 * and `./domain/index.js` (pure helpers).
 */

// Re-export the domain pure helpers from the historical module path.
export {
  buildExCh,
  chunk,
  numOrNull,
  parseLevels,
  parseMisItem,
  parseMisResponse,
  computeMarketStatus,
} from "./domain/index.js";

export {
  TwseFeed,
  type CandleEvent,
  type TwseFeedEvents,
  type TwseFeedDeps,
} from "./usecase/quoteFeed.js";
