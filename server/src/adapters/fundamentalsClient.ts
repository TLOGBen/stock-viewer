/**
 * adapters/fundamentalsClient — outbound IO boundary for the TWSE OpenAPI
 * opendata directory endpoints that return a flat JSON array of object rows
 * keyed by Chinese column names: 公司基本資料 (t187ap03_L), 月營收 (t187ap05_L),
 * 損益表 (t187ap06_L_*), 資產負債 (t187ap07_L_*), 股利 (t187ap45_L).
 *
 * This client is intentionally generic: the caller (a usecase) supplies the
 * full endpoint URL and gets back the raw `Record<string, unknown>[]`. All
 * row→rich-type parsing stays pure in `domain/` (parseRevenueRow / parseCompanyRow
 * / parseFinStatementRow / parseBalanceRow / parseDividendRow). The fetch is
 * injectable so usecases (and their tests) can substitute a stub.
 *
 * Throws on non-2xx / timeout — each caller wraps a source in try/catch so one
 * failed endpoint never kills the rest of a stock-page load. Returns [] when the
 * body is not a JSON array.
 */

/** Browser-like UA — the official endpoints reject empty/script agents. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** Per-request abort budget — opendata directories can be a few MB. */
const REQUEST_TIMEOUT_MS = 15_000;

export interface FundamentalsClient {
  /**
   * Fetch one opendata directory endpoint as a raw object-row array. `url` is
   * the full endpoint (e.g. ".../v1/opendata/t187ap05_L"). Throws on HTTP
   * error / timeout; returns [] when the body is not a JSON array.
   */
  fetchRows(url: string): Promise<Record<string, unknown>[]>;
}

/** Real fundamentals client backed by `fetch` (injectable for tests). */
export function createFundamentalsClient(
  fetchImpl: typeof fetch = fetch,
): FundamentalsClient {
  return {
    async fetchRows(url: string): Promise<Record<string, unknown>[]> {
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`opendata HTTP ${res.status} for ${url}`);
      }
      const json: unknown = await res.json();
      return Array.isArray(json)
        ? (json as Record<string, unknown>[])
        : [];
    },
  };
}
