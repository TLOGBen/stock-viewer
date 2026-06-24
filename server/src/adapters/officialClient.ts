/**
 * adapters/officialClient — outbound IO boundary for the official TWSE OpenAPI
 * bulk daily-close directory (`STOCK_DAY_ALL`). Fetches the single endpoint and
 * returns the raw `StockDayAllRow[]`; the row→Quote conversion is a pure domain
 * function (`parseStockDayAllRow`) and the on-disk/in-memory caching lives in
 * `persistence/officialCloseCache`.
 *
 * The fetch is injectable so the cache (and its tests) can substitute a stub.
 * Timeout / non-2xx throw here at the boundary; the caller (the cache) catches
 * and serves stale data, so a failed fetch never crashes the feed.
 */
import type { StockDayAllRow } from "../domain/index.js";

const FETCH_TIMEOUT_MS = 10_000;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

export interface OfficialClient {
  /**
   * Fetch the bulk `STOCK_DAY_ALL` directory as `StockDayAllRow[]`. Throws on
   * non-2xx / timeout; returns `[]` when the body is not a JSON array.
   */
  fetchStockDayAll(url: string): Promise<StockDayAllRow[]>;
}

/** Real official client backed by `fetch` (injectable for tests). */
export function createOfficialClient(
  fetchImpl: typeof fetch = fetch,
): OfficialClient {
  return {
    async fetchStockDayAll(url: string): Promise<StockDayAllRow[]> {
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      return Array.isArray(json) ? (json as StockDayAllRow[]) : [];
    },
  };
}
