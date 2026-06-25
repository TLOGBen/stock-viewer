import type { Dividend, ExDividend } from "../domain/index.js";
import { recentTradingDays } from "../domain/index.js";
import {
  DEFAULT_RECENT_DAYS,
  type DividendSeriesFetcher,
  type ExRightCache,
} from "./stockPageDeps.js";

/**
 * usecase/getDividends — resolve the 個股頁 「股利政策」 block.
 *
 * Main table (REQ-007 S1): the ap45 股利分派 series for the symbol (cash and
 * stock dividends already summed across their component columns in the domain
 * parser, board resolution date carried raw).
 *
 * Ex-dividend date (REQ-007 S2 / N2): TWT49U and ap45 share NO join key, so we
 * do NOT pair rows heuristically or fabricate history. We only surface the MOST
 * RECENT ex-dividend event for the symbol that appears within the by-date
 * accumulation window (cache A). Absent in the window → exDividend:null and the
 * UI shows 「—」.
 *
 * Never throws — each region degrades independently to empty/null.
 */

/** Narrow deps subset for getDividends. */
export interface GetDividendsDeps {
  dividends: DividendSeriesFetcher;
  exRight: ExRightCache;
}

/** The 股利政策 view. */
export interface DividendsView {
  symbol: string;
  coverage: boolean;
  series: Dividend[];
  /**
   * Most recent ex-dividend event seen in the by-date window (N2), or null. NOT
   * historically matched to any 股利年度 — purely "the latest ex-date observed".
   */
  exDividend: ExDividend | null;
}

/**
 * Find the most recent ex-dividend event for `symbol` across the recent by-date
 * window. getRecentDays returns days newest-first, so the first day whose map
 * contains the symbol is the latest ex-date. A day whose ex-date is unparseable
 * (NaN) is still surfaced; the caller/UI formats NaN as「—」.
 */
async function latestExDividend(
  cache: ExRightCache,
  symbol: string,
  now: Date,
  windowDays: number,
): Promise<ExDividend | null> {
  try {
    const dates = recentTradingDays(now, windowDays);
    const days = await cache.getRecentDays(dates); // newest-first
    for (const { map } of days) {
      const ev = map.get(symbol);
      if (ev != null) return ev;
    }
    return null;
  } catch (err) {
    console.error(`[getDividends] ${symbol} exRight window failed:`, err);
    return null;
  }
}

export async function getDividends(
  deps: GetDividendsDeps,
  symbol: string,
  now: Date = new Date(),
  windowDays: number = DEFAULT_RECENT_DAYS,
): Promise<DividendsView> {
  let series: Dividend[] = [];
  try {
    series = await deps.dividends(symbol);
  } catch (err) {
    console.error(`[getDividends] ${symbol} series failed:`, err);
  }

  const exDividend = await latestExDividend(
    deps.exRight,
    symbol,
    now,
    windowDays,
  );

  return {
    symbol,
    coverage: series.length > 0,
    series,
    exDividend,
  };
}
