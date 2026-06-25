import type { SymbolStats, Exch } from "../domain/index.js";
import type { HistoryCache } from "../persistence/index.js";
import { statsFromDaily, emptyStats } from "../domain/index.js";
import type { UniverseProvider } from "./universeService.js";

/**
 * usecase/getMarketStats — resolve per-symbol summary statistics (QM-2) from the
 * daily-candle cache. Orchestrates the injected HistoryCache + universe provider
 * and folds the pure `domain/marketStats` arithmetic. Never throws: a fetch/cache
 * failure (HistoryCache.getDaily degrades to []) yields all-null stats rather
 * than an error, so the action layer only serializes the result.
 */
export interface GetMarketStatsDeps {
  historyCache: HistoryCache;
  provider: UniverseProvider;
}

export async function getMarketStats(
  deps: GetMarketStatsDeps,
  symbol: string,
): Promise<SymbolStats> {
  const exch = (deps.provider.get(symbol)?.exch ?? "tse") as Exch;
  try {
    const daily = await deps.historyCache.getDaily(symbol, exch);
    return statsFromDaily(symbol, daily);
  } catch (err) {
    console.error(`[marketStats] getMarketStats ${symbol} failed:`, err);
    return emptyStats(symbol);
  }
}
