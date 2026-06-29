/**
 * adapters/historyClient — outbound IO boundary for the daily-K endpoints:
 * TWSE STOCK_DAY (上市) and TPEx tradingStock (上櫃). Each method ONLY fetches
 * one month of raw JSON for a symbol; the response→Candle parsing stays pure in
 * `domain/history` (`parseStockDayResponse` / `parseTpexResponse`). The fetch is
 * injectable for tests.
 *
 * Throws on non-2xx / timeout — the caller wraps each month in try/catch so one
 * failed month never kills the rest of the backfill.
 */

/** TWSE STOCK_DAY base URL (rwd afterTrading JSON endpoint). */
const STOCK_DAY_URL = "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY";

/** TPEx 上櫃 個股日成交 base URL (new tpex.org.tw site, JSON endpoint). */
const TPEX_DAILY_URL =
  "https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock";

/** Browser-like UA — the TWSE rwd endpoint rejects empty/script agents. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** Per-request abort budget — STOCK_DAY can be slow under load. */
const REQUEST_TIMEOUT_MS = 12_000;

export interface HistoryClient {
  /**
   * Fetch ONE month of STOCK_DAY rows for `symbol` (date = "YYYYMM01"), returning
   * the raw JSON body. Throws on HTTP error / timeout. (上市 / TWSE)
   */
  fetchMonthRaw(symbol: string, date: string): Promise<unknown>;
  /**
   * Fetch ONE month of TPEx tradingStock rows for `symbol` (date = Gregorian
   * "YYYY/MM/DD"), returning the raw JSON body. Throws on HTTP error / timeout.
   * (上櫃 / TPEx)
   */
  fetchTpexMonthRaw(symbol: string, date: string): Promise<unknown>;
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

    async fetchTpexMonthRaw(symbol: string, date: string): Promise<unknown> {
      const params = new URLSearchParams({
        code: symbol,
        date,
        id: "",
        response: "json",
      });
      const url = `${TPEX_DAILY_URL}?${params.toString()}`;
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        throw new Error(
          `TPEx tradingStock HTTP ${res.status} for ${symbol}@${date}`,
        );
      }
      return (await res.json()) as unknown;
    },
  };
}
