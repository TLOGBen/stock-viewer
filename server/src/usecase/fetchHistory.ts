import type { Candle, Exch } from "../domain/index.js";
import { parseStockDayResponse, parseTpexResponse } from "../domain/index.js";
import {
  createHistoryClient,
  type HistoryClient,
} from "../adapters/index.js";

/**
 * usecase/fetchHistory — daily K-line backfill orchestration over the per-
 * exchange endpoints: TWSE STOCK_DAY (上市/tse) and TPEx tradingStock (上櫃/otc).
 * One request per month for the last `monthsBack` months (via the injectable
 * adapters/historyClient); the pure response→Candle parsing lives in
 * `domain/history`. Each exchange differs only in its month-query date format
 * and its fetch+parse pair; the loop, spacing, and merge are shared.
 */

/** Polite spacing between month requests so we do not hammer the endpoint. */
const INTER_REQUEST_DELAY_MS = 120;

/** Resolve after `ms` — a cancellation-free micro delay between requests. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** First-of-month `Date` (UTC) for the month `monthsAgo` months before `now`. */
function monthStart(monthsAgo: number, now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
}

/** TWSE "YYYYMM01" query date for the month that is `monthsAgo` before now. */
function monthQueryDate(monthsAgo: number, now: Date): string {
  const target = monthStart(monthsAgo, now);
  const yyyy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}${mm}01`;
}

/** TPEx Gregorian "YYYY/MM/01" query date for the month `monthsAgo` before now. */
function tpexMonthQueryDate(monthsAgo: number, now: Date): string {
  const target = monthStart(monthsAgo, now);
  const yyyy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}/01`;
}

/** Per-exchange month plan: how to build a query date and fetch+parse a month. */
interface MonthPlan {
  queryDate: (monthsAgo: number, now: Date) => string;
  fetchMonth: (
    client: HistoryClient,
    symbol: string,
    date: string,
  ) => Promise<Candle[]>;
}

/** Resolve the fetch+parse + date-format pair for an exchange. */
function planFor(exch: Exch): MonthPlan {
  if (exch === "otc") {
    return {
      queryDate: tpexMonthQueryDate,
      fetchMonth: async (client, symbol, date) =>
        parseTpexResponse(await client.fetchTpexMonthRaw(symbol, date)),
    };
  }
  return {
    queryDate: monthQueryDate,
    fetchMonth: async (client, symbol, date) =>
      parseStockDayResponse(await client.fetchMonthRaw(symbol, date)),
  };
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
 * One request per month against the exchange's endpoint (tse → STOCK_DAY,
 * otc → TPEx tradingStock), spaced by a short delay; each month is wrapped in
 * try/catch so a single failure never kills the rest. The merged result is
 * sorted ascending and deduped by timestamp.
 */
export async function fetchDailyCandles(
  symbol: string,
  exch: Exch,
  monthsBack: number,
  client: HistoryClient = createHistoryClient(),
): Promise<Candle[]> {
  const plan = planFor(exch);
  const months = Number.isFinite(monthsBack)
    ? Math.max(1, Math.trunc(monthsBack))
    : 1;
  const now = new Date();
  const batches: Candle[][] = [];

  for (let i = 0; i < months; i++) {
    if (i > 0) await delay(INTER_REQUEST_DELAY_MS);
    const date = plan.queryDate(i, now);
    try {
      const monthCandles = await plan.fetchMonth(client, symbol, date);
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
