/**
 * Per-symbol summary statistics (QM-2). The pure arithmetic (`statsFromDaily` /
 * `emptyStats`) now lives in `domain/marketStats.ts`; this module keeps the I/O
 * wrapper that pulls candles from the HistoryCache and re-exports the pure parts
 * so existing `./marketStats.js` import sites (and tests) keep compiling.
 */
import type { SymbolStats } from "./types.js";
import type { HistoryCache } from "./historyCache.js";
import type { Exch } from "./historyFetcher.js";
import { statsFromDaily, emptyStats } from "./domain/marketStats.js";

export { statsFromDaily, emptyStats } from "./domain/marketStats.js";

/**
 * Resolve summary stats for `symbol` from the daily-candle cache. Never throws;
 * on a fetch/cache failure (HistoryCache.getDaily degrades to []) the result is
 * all-null stats rather than an error.
 */
export async function computeStats(
  symbol: string,
  exch: Exch,
  historyCache: HistoryCache,
): Promise<SymbolStats> {
  try {
    const daily = await historyCache.getDaily(symbol, exch);
    return statsFromDaily(symbol, daily);
  } catch (err) {
    console.error(`[marketStats] computeStats ${symbol} failed:`, err);
    return emptyStats(symbol);
  }
}
