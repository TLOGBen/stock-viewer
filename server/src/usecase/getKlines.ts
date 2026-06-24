import type { Candle, KlineInterval } from "../domain/index.js";
import type { CandleStore, HistoryCache } from "../persistence/index.js";
import { rollupDaily } from "../persistence/index.js";
import type { UniverseProvider } from "./universeService.js";

/**
 * usecase/getKlines — resolve K-line bars for a symbol/interval. Intraday
 * (1m/5m/15m) is served from the in-memory candle fold; daily/weekly/monthly is
 * backfilled from the on-disk daily cache (STOCK_DAY) and rolled up for W/M.
 *
 * Pure orchestration over injected stores — the action layer only validates the
 * request and serializes the result.
 */
export interface GetKlinesDeps {
  candleStore: CandleStore;
  historyCache: HistoryCache;
  provider: UniverseProvider;
}

const INTRADAY: ReadonlySet<KlineInterval> = new Set<KlineInterval>([
  "1m",
  "5m",
  "15m",
]);

export async function getKlines(
  deps: GetKlinesDeps,
  symbol: string,
  interval: KlineInterval,
  limit: number,
): Promise<Candle[]> {
  if (INTRADAY.has(interval)) {
    // Intraday: served from the in-memory fold (1m/5m/15m only).
    return deps.candleStore.getIntraday(
      symbol,
      interval as "1m" | "5m" | "15m",
      limit,
    );
  }
  // Daily/weekly/monthly: backfilled from STOCK_DAY via the cache, rolled up for
  // W/M. Resolve the exchange (default tse).
  const exch = deps.provider.get(symbol)?.exch ?? "tse";
  const daily = await deps.historyCache.getDaily(symbol, exch);
  return interval === "D" ? daily : rollupDaily(daily, interval as "W" | "M");
}
