import type { MarginData } from "../domain/index.js";
import { recentTradingDays } from "../domain/index.js";
import { DEFAULT_RECENT_DAYS, type MarginCache } from "./stockPageDeps.js";

/**
 * usecase/getMargin — resolve the 個股頁 「融資融券」 block. Sweeps the recent
 * by-date window (cache A) and slices each day's whole-market map for the
 * symbol, building a per-day series (newest-first).
 *
 * Unit note (C5): balances are 張 (carried from the domain parser, NOT re-scaled
 * — MI_MARGN is already in 張). 券資比 % = 融券 / 融資 × 100 (also from the parser).
 *
 * Cold start (REQ-009): a single accumulated day → a single point; nothing here
 * fabricates history. Never throws.
 */

/** Narrow deps subset for getMargin. */
export interface GetMarginDeps {
  margin: MarginCache;
}

/** One day's 融資融券 balances (張) tagged with its trading day. */
export interface MarginDay extends MarginData {
  /** Trading day, "YYYYMMDD". */
  date: string;
}

/** The 融資融券 view: per-day series, newest-first. */
export interface MarginView {
  symbol: string;
  coverage: boolean;
  days: MarginDay[];
}

export async function getMargin(
  deps: GetMarginDeps,
  symbol: string,
  now: Date = new Date(),
  windowDays: number = DEFAULT_RECENT_DAYS,
): Promise<MarginView> {
  try {
    const dates = recentTradingDays(now, windowDays);
    const days = await deps.margin.getRecentDays(dates); // newest-first
    const series: MarginDay[] = [];
    for (const { date, map } of days) {
      const row = map.get(symbol);
      if (row != null) series.push({ date, ...row });
    }
    return { symbol, coverage: series.length > 0, days: series };
  } catch (err) {
    console.error(`[getMargin] ${symbol} failed:`, err);
    return { symbol, coverage: false, days: [] };
  }
}
