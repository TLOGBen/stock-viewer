import type { Candle, Exch } from "../domain/index.js";
import { parseStockDayResponse } from "../domain/index.js";
import {
  createHistoryClient,
  type HistoryClient,
} from "../adapters/index.js";

/**
 * usecase/fetchHistory — daily K-line backfill orchestration over the TWSE
 * STOCK_DAY endpoint. One request per month for the last `monthsBack` months
 * (via the injectable adapters/historyClient); the pure response→Candle parsing
 * lives in `domain/history`.
 *
 * TPEx (otc) has no reliable equivalent wired here yet, so otc returns [] and
 * never throws — tse is the priority surface for backfill.
 */

/** Polite spacing between month requests so we do not hammer the endpoint. */
const INTER_REQUEST_DELAY_MS = 120;

/** Resolve after `ms` — a cancellation-free micro delay between requests. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * Fetch (via the injectable adapters/historyClient) + parse a single month of
 * STOCK_DAY rows. Throws on HTTP error (from the client).
 */
async function fetchMonth(
  client: HistoryClient,
  symbol: string,
  date: string,
): Promise<Candle[]> {
  const json = await client.fetchMonthRaw(symbol, date);
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
  client: HistoryClient = createHistoryClient(),
): Promise<Candle[]> {
  if (exch !== "tse") return [];

  const months = Number.isFinite(monthsBack)
    ? Math.max(1, Math.trunc(monthsBack))
    : 1;
  const now = new Date();
  const batches: Candle[][] = [];

  for (let i = 0; i < months; i++) {
    if (i > 0) await delay(INTER_REQUEST_DELAY_MS);
    const date = monthQueryDate(i, now);
    try {
      const monthCandles = await fetchMonth(client, symbol, date);
      batches.push(monthCandles);
    } catch (err) {
      console.error(
        `[fetchHistory] month ${date} for ${symbol} failed:`,
        err,
      );
    }
  }

  return mergeCandles(batches);
}
