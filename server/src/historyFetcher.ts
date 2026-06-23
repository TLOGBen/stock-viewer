import type { Candle } from "./types.js";

/**
 * Daily K-line backfill from the TWSE STOCK_DAY endpoint (key-free).
 *
 * One request per month for the last `monthsBack` months. Pure parsing helpers
 * (ROC date → epoch, comma strip, row → Candle) are exported for unit tests so
 * the mapping is verifiable without touching the network.
 *
 * TPEx (otc) has no reliable equivalent wired here yet, so otc returns [] and
 * never throws — tse is the priority surface for backfill.
 */

/** TWSE STOCK_DAY base URL (rwd afterTrading JSON endpoint). */
const STOCK_DAY_URL =
  "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY";

/** Browser-like UA — the TWSE rwd endpoint rejects empty/script agents. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** Per-request abort budget — STOCK_DAY can be slow under load. */
const REQUEST_TIMEOUT_MS = 12_000;

/** Polite spacing between month requests so we do not hammer the endpoint. */
const INTER_REQUEST_DELAY_MS = 120;

/** Exchange tokens accepted by the fetcher. */
export type Exch = "tse" | "otc";

/** A single STOCK_DAY response body (loosely typed — validated at parse time). */
interface StockDayResponse {
  stat?: unknown;
  data?: unknown;
}

/** Resolve after `ms` — a cancellation-free micro delay between requests. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strip every thousands separator before numeric parsing ("45,207" → "45207"). */
export function stripCommas(value: string): string {
  return value.replace(/,/g, "");
}

/**
 * Parse a ROC-calendar date like "115/06/01" into the epoch ms of that day's
 * UTC midnight (the bar's open timestamp). ROC year + 1911 = Gregorian year.
 * Returns NaN for any malformed token so callers can skip the row.
 */
export function rocDateToEpoch(roc: string): number {
  const parts = roc.trim().split("/");
  if (parts.length !== 3) return Number.NaN;
  const [rocYearStr, monthStr, dayStr] = parts;
  if (rocYearStr == null || monthStr == null || dayStr == null)
    return Number.NaN;
  const rocYear = Number.parseInt(rocYearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);
  if (
    !Number.isFinite(rocYear) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return Number.NaN;
  }
  const year = rocYear + 1911;
  return Date.UTC(year, month - 1, day);
}

/** Parse a comma-formatted numeric cell to a number (NaN when malformed/empty). */
function parseNumericCell(cell: unknown): number {
  if (typeof cell !== "string") return Number.NaN;
  const cleaned = stripCommas(cell).trim();
  if (cleaned === "" || cleaned === "-") return Number.NaN;
  return Number.parseFloat(cleaned);
}

/**
 * STOCK_DAY column order:
 * [ ROC date, 成交股數, 成交金額, 開盤價, 最高價, 最低價, 收盤價,
 *   漲跌價差, 成交筆數, 註記 ].
 * Volume is reported in 股 and converted to 張 via round(股 / 1000).
 *
 * Returns null when the date or close cannot be parsed (caller skips the row).
 */
export function parseStockDayRow(row: readonly unknown[]): Candle | null {
  const dateCell = row[0];
  if (typeof dateCell !== "string") return null;

  const timestamp = rocDateToEpoch(dateCell);
  if (!Number.isFinite(timestamp)) return null;

  const sharesVolume = parseNumericCell(row[1]);
  const open = parseNumericCell(row[3]);
  const high = parseNumericCell(row[4]);
  const low = parseNumericCell(row[5]);
  const close = parseNumericCell(row[6]);

  // Close is the load-bearing field; a NaN close means a placeholder/no-trade row.
  if (!Number.isFinite(close)) return null;

  // 股 → 張. Non-finite volume degrades to 0 rather than poisoning the bar.
  const volume = Number.isFinite(sharesVolume)
    ? Math.round(sharesVolume / 1000)
    : 0;

  return {
    timestamp,
    // open/high/low may be "-" on rare rows; fall back to close to keep a valid OHLC.
    open: Number.isFinite(open) ? open : close,
    high: Number.isFinite(high) ? high : close,
    low: Number.isFinite(low) ? low : close,
    close,
    volume,
  };
}

/**
 * Map a whole STOCK_DAY response to Candles. Returns [] unless stat === "OK"
 * and data is an array; individual rows that fail to parse are dropped.
 */
export function parseStockDayResponse(json: unknown): Candle[] {
  const body = (json ?? {}) as StockDayResponse;
  if (body.stat !== "OK") return [];
  const rows = body.data;
  if (!Array.isArray(rows)) return [];

  const candles: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const candle = parseStockDayRow(row);
    if (candle != null) candles.push(candle);
  }
  return candles;
}

/** "YYYYMM01" query date for the month that is `monthsAgo` months before now. */
function monthQueryDate(monthsAgo: number, now: Date): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-based
  const target = new Date(Date.UTC(year, month - monthsAgo, 1));
  const yyyy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}${mm}01`;
}

/** Fetch + parse a single month of STOCK_DAY rows. Throws on HTTP/parse error. */
async function fetchMonth(symbol: string, date: string): Promise<Candle[]> {
  const params = new URLSearchParams({
    response: "json",
    stockNo: symbol,
    date,
  });
  const url = `${STOCK_DAY_URL}?${params.toString()}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`STOCK_DAY HTTP ${res.status} for ${symbol}@${date}`);
  }
  const json: unknown = await res.json();
  return parseStockDayResponse(json);
}

/** Merge month batches: sort ascending by timestamp and dedupe (last write wins). */
function mergeCandles(batches: Candle[][]): Candle[] {
  const byTimestamp = new Map<number, Candle>();
  for (const batch of batches) {
    for (const candle of batch) {
      byTimestamp.set(candle.timestamp, candle);
    }
  }
  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Fetch daily Candles for `symbol` over the last `monthsBack` months.
 *
 * - tse: one STOCK_DAY request per month, spaced by a short delay; each month
 *   is wrapped in try/catch so a single failure never kills the rest. The
 *   merged result is sorted ascending and deduped by timestamp.
 * - otc: returns [] (no reliable endpoint wired) — never throws.
 */
export async function fetchDailyCandles(
  symbol: string,
  exch: Exch,
  monthsBack: number,
): Promise<Candle[]> {
  if (exch !== "tse") return [];

  const months = Number.isFinite(monthsBack) ? Math.max(1, Math.trunc(monthsBack)) : 1;
  const now = new Date();
  const batches: Candle[][] = [];

  for (let i = 0; i < months; i++) {
    if (i > 0) await delay(INTER_REQUEST_DELAY_MS);
    const date = monthQueryDate(i, now);
    try {
      const monthCandles = await fetchMonth(symbol, date);
      batches.push(monthCandles);
    } catch (err) {
      console.error(
        `[historyFetcher] month ${date} for ${symbol} failed:`,
        err,
      );
    }
  }

  return mergeCandles(batches);
}
