/**
 * adapters/valuationClient — outbound IO boundary for the two 估值 (valuation)
 * sources:
 *
 *   • 個股本益比/殖利率/股價淨值比 (openapi BWIBBU_ALL) — a whole-market object-row
 *     array keyed by Chinese-ish column names (PEratio / PBratio / DividendYield).
 *     Domain `parseBwibbuRow` turns one row into a ValuationPoint (PE/PB share
 *     the same row). DividendYield "3.31" is already a percentage value.
 *   • 除權除息計算結果 (rwd exRight/TWT49U) — a by-day whole-market report in the
 *     rwd `{ fields, data }` shape; the first column 資料日期 is a Chinese ROC
 *     date ("115年06月25日"). Domain `parseExRightRow` + `rocCnDate` parse it.
 *
 * Both calls return RAW payloads; parsing stays pure in `domain/`. The fetch is
 * injectable for tests. Throws on non-2xx / timeout so the caller wraps each
 * source in try/catch.
 */
import type { RwdResponse } from "./chipsClient.js";

/** openapi BWIBBU_ALL directory (PE/PB/殖利率, whole-market object rows). */
const BWIBBU_URL = "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL";

/** rwd TWT49U base URL (除權除息計算結果, by-day whole-market JSON). */
const TWT49U_URL = "https://www.twse.com.tw/rwd/zh/exRight/TWT49U";

/** Browser-like UA — both endpoints reject empty/script agents. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** Per-request abort budget. */
const REQUEST_TIMEOUT_MS = 15_000;

export interface ValuationClient {
  /**
   * Fetch the whole-market BWIBBU_ALL directory as raw object rows. Throws on
   * HTTP error / timeout; returns [] when the body is not a JSON array.
   */
  fetchBwibbuRows(): Promise<Record<string, unknown>[]>;
  /**
   * Fetch the TWT49U 除權除息 report as raw rwd `{ fields, data }`. The endpoint
   * returns the most recent published day (no by-date param). Throws on HTTP
   * error / timeout.
   */
  fetchExRight(): Promise<RwdResponse>;
}

/** Real valuation client backed by `fetch` (injectable for tests). */
export function createValuationClient(
  fetchImpl: typeof fetch = fetch,
): ValuationClient {
  return {
    async fetchBwibbuRows(): Promise<Record<string, unknown>[]> {
      const res = await fetchImpl(BWIBBU_URL, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`BWIBBU_ALL HTTP ${res.status}`);
      }
      const json: unknown = await res.json();
      return Array.isArray(json)
        ? (json as Record<string, unknown>[])
        : [];
    },

    async fetchExRight(): Promise<RwdResponse> {
      const params = new URLSearchParams({ response: "json" });
      const url = `${TWT49U_URL}?${params.toString()}`;
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`TWT49U HTTP ${res.status}`);
      }
      const json: unknown = await res.json();
      return (json ?? {}) as RwdResponse;
    },
  };
}
