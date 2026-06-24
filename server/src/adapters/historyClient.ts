/**
 * adapters/historyClient — outbound IO boundary for the TWSE STOCK_DAY (rwd
 * afterTrading) daily-K endpoint. It ONLY fetches one month of raw JSON for a
 * symbol; the response→Candle parsing stays pure in `historyFetcher`
 * (`parseStockDayResponse`). The fetch is injectable for tests.
 *
 * Throws on non-2xx / timeout — the caller wraps each month in try/catch so one
 * failed month never kills the rest of the backfill.
 */

/** TWSE STOCK_DAY base URL (rwd afterTrading JSON endpoint). */
const STOCK_DAY_URL = "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY";

/** Browser-like UA — the TWSE rwd endpoint rejects empty/script agents. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** Per-request abort budget — STOCK_DAY can be slow under load. */
const REQUEST_TIMEOUT_MS = 12_000;

export interface HistoryClient {
  /**
   * Fetch ONE month of STOCK_DAY rows for `symbol` (date = "YYYYMM01"), returning
   * the raw JSON body. Throws on HTTP error / timeout.
   */
  fetchMonthRaw(symbol: string, date: string): Promise<unknown>;
}

/** Real history client backed by `fetch` (injectable for tests). */
export function createHistoryClient(
  fetchImpl: typeof fetch = fetch,
): HistoryClient {
  return {
    async fetchMonthRaw(symbol: string, date: string): Promise<unknown> {
      const params = new URLSearchParams({
        response: "json",
        stockNo: symbol,
        date,
      });
      const url = `${STOCK_DAY_URL}?${params.toString()}`;
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        throw new Error(`STOCK_DAY HTTP ${res.status} for ${symbol}@${date}`);
      }
      return (await res.json()) as unknown;
    },
  };
}
