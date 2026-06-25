import type { Candle } from "./types.js";

/**
 * Pure parsing for the TWSE STOCK_DAY daily-K endpoint: ROC date → epoch,
 * comma strip, row → Candle, response → Candle[]. No I/O — the network fetch
 * lives in `adapters/historyClient` and the orchestration in
 * `usecase/fetchHistory`.
 */

/** Exchange tokens accepted by the history fetcher. */
export type Exch = "tse" | "otc";

/** A single STOCK_DAY response body (loosely typed — validated at parse time). */
interface StockDayResponse {
  stat?: unknown;
  data?: unknown;
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
