/**
 * adapters/chipsClient — outbound IO boundary for the two 籌碼 (chip) sources:
 *
 *   • 三大法人買賣超 (rwd fund/T86) — a by-date, whole-market report in the rwd
 *     `{ fields, data }` 2D-array shape. The caller passes a "YYYYMMDD" date and
 *     gets back the raw response; domain `parseT86Row(fields,row)` locates
 *     columns by name and converts 股→張.
 *   • 融資融券餘額 (openapi MI_MARGN) — a whole-market object-row array keyed by
 *     Chinese column names (融資今日餘額 …, in 張). Domain `parseMarginRow`.
 *
 * Both calls return RAW payloads (rows[] / {fields,data}); all parsing stays
 * pure in `domain/`. The fetch is injectable for tests. Throws on non-2xx /
 * timeout so the caller (usecase / cache) can wrap each source in try/catch.
 */

/** rwd response envelope: column-ordered 2D `data` located by `fields` names. */
export interface RwdResponse {
  /** "OK" when the query succeeded. */
  stat?: string;
  /** Column header names, in `data` row order. */
  fields?: unknown[];
  /** Column-ordered rows. */
  data?: unknown[][];
}

/** rwd T86 base URL (三大法人買賣超日報, by-date whole-market JSON). */
const T86_URL = "https://www.twse.com.tw/rwd/zh/fund/T86";

/** openapi MI_MARGN directory (融資融券彙總, whole-market object rows). */
const MI_MARGN_URL = "https://openapi.twse.com.tw/v1/exchangeReport/MI_MARGN";

/** Browser-like UA — both endpoints reject empty/script agents. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** Per-request abort budget. */
const REQUEST_TIMEOUT_MS = 15_000;

export interface ChipsClient {
  /**
   * Fetch one trading day's whole-market T86 report. `date` is "YYYYMMDD".
   * Returns the raw rwd `{ fields, data }`. Throws on HTTP error / timeout.
   */
  fetchT86ByDate(date: string): Promise<RwdResponse>;
  /**
   * Fetch the whole-market MI_MARGN directory as raw object rows. Throws on HTTP
   * error / timeout; returns [] when the body is not a JSON array.
   */
  fetchMarginRows(): Promise<Record<string, unknown>[]>;
}

/** Real chips client backed by `fetch` (injectable for tests). */
export function createChipsClient(
  fetchImpl: typeof fetch = fetch,
): ChipsClient {
  return {
    async fetchT86ByDate(date: string): Promise<RwdResponse> {
      const params = new URLSearchParams({
        date,
        selectType: "ALL",
        response: "json",
      });
      const url = `${T86_URL}?${params.toString()}`;
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`T86 HTTP ${res.status} for ${date}`);
      }
      const json: unknown = await res.json();
      return (json ?? {}) as RwdResponse;
    },

    async fetchMarginRows(): Promise<Record<string, unknown>[]> {
      const res = await fetchImpl(MI_MARGN_URL, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`MI_MARGN HTTP ${res.status}`);
      }
      const json: unknown = await res.json();
      return Array.isArray(json)
        ? (json as Record<string, unknown>[])
        : [];
    },
  };
}
