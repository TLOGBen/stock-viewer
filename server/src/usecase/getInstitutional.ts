import type { InstitutionalFlow } from "../domain/index.js";
import { recentTradingDays } from "../domain/index.js";
import {
  DEFAULT_RECENT_DAYS,
  type InstitutionalCache,
} from "./stockPageDeps.js";

/**
 * usecase/getInstitutional — resolve the 個股頁 「三大法人買賣超」 block. Sweeps the
 * recent by-date window (cache A) and slices each day's whole-market map for the
 * symbol, building a per-day series (newest-first). The domain parser already
 * converted 股→張, so this usecase only orchestrates the reads.
 *
 * Cold start (REQ-008): with only one accumulated day the series is a single
 * point and the UI labels it; nothing here fabricates history. Never throws —
 * the cache degrades a bad/missing day to an empty map and skips it.
 */

/** Narrow deps subset for getInstitutional. */
export interface GetInstitutionalDeps {
  institutional: InstitutionalCache;
}

/** One day's 三大法人 net (張) tagged with its trading day. */
export interface InstitutionalDay extends InstitutionalFlow {
  /** Trading day, "YYYYMMDD". */
  date: string;
}

/** The 三大法人 view: per-day series, newest-first. */
export interface InstitutionalView {
  symbol: string;
  coverage: boolean;
  days: InstitutionalDay[];
}

export async function getInstitutional(
  deps: GetInstitutionalDeps,
  symbol: string,
  now: Date = new Date(),
  windowDays: number = DEFAULT_RECENT_DAYS,
): Promise<InstitutionalView> {
  try {
    const dates = recentTradingDays(now, windowDays);
    const days = await deps.institutional.getRecentDays(dates); // newest-first
    const series: InstitutionalDay[] = [];
    for (const { date, map } of days) {
      const flow = map.get(symbol);
      if (flow != null) series.push({ date, ...flow });
    }
    return { symbol, coverage: series.length > 0, days: series };
  } catch (err) {
    console.error(`[getInstitutional] ${symbol} failed:`, err);
    return { symbol, coverage: false, days: [] };
  }
}
