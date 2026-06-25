import type { ValuationPoint, ValuationBand } from "../domain/index.js";
import { recentTradingDays, bandFromSeries } from "../domain/index.js";
import {
  VALUATION_WINDOW_DAYS,
  type ValuationCache,
} from "./stockPageDeps.js";

/**
 * usecase/getValuation — resolve the 個股頁 「估值河流圖」 block for BOTH PE and PB
 * (REQ-010). Both ratios live on the SAME BWIBBU row, so one by-date sweep
 * (cache A) yields one ValuationPoint series, and PE and PB each feed the SAME
 * pure `bandFromSeries` (no second endpoint, no second cache — spec R-PB).
 *
 * The current placement (現價落點) uses the MOST RECENT day's PE/PB as `current`
 * against the historical distribution. Empty PEratio/PBratio cells (e.g. 台泥's
 * blank PE) are null and dropped by `bandFromSeries`, so they neither distort
 * the band nor place a phantom current point.
 *
 * Cold start: a short series still draws a band (with few points) and the UI
 * shows 「估值歷史累積中」; an entirely empty series → both bands null +
 * coverage:false. Never throws.
 */

/** Narrow deps subset for getValuation. */
export interface GetValuationDeps {
  valuation: ValuationCache;
}

/** One accumulated day's PE/PB point tagged with its raw BWIBBU date. */
export interface ValuationDay {
  /** Raw ROC packed date as reported by BWIBBU (e.g. "1150624"). */
  date: string;
  pe: number | null;
  pb: number | null;
}

/** The 估值河流圖 view: PE & PB bands over the accumulated series. */
export interface ValuationView {
  symbol: string;
  coverage: boolean;
  /** The accumulated PE/PB points, newest-first. */
  series: ValuationDay[];
  /** Quantile band over real PE history + current placement; null cold-start. */
  pe: ValuationBand | null;
  /** Quantile band over real PB history + current placement; null cold-start. */
  pb: ValuationBand | null;
}

/** A coverage:false view for an empty/failed valuation sweep. */
function empty(symbol: string): ValuationView {
  return { symbol, coverage: false, series: [], pe: null, pb: null };
}

export async function getValuation(
  deps: GetValuationDeps,
  symbol: string,
  now: Date = new Date(),
  windowDays: number = VALUATION_WINDOW_DAYS,
): Promise<ValuationView> {
  try {
    const dates = recentTradingDays(now, windowDays);
    const days = await deps.valuation.getRecentDays(dates); // newest-first

    const series: ValuationDay[] = [];
    for (const { map } of days) {
      const pt: ValuationPoint | undefined = map.get(symbol);
      if (pt != null) series.push({ date: pt.date, pe: pt.pe, pb: pt.pb });
    }
    if (series.length === 0) return empty(symbol);

    // current = the most recent day's ratio (series is newest-first).
    const currentPe = series[0]!.pe;
    const currentPb = series[0]!.pb;
    const pe = bandFromSeries(series.map((d) => d.pe), currentPe);
    const pb = bandFromSeries(series.map((d) => d.pb), currentPb);

    return { symbol, coverage: true, series, pe, pb };
  } catch (err) {
    console.error(`[getValuation] ${symbol} failed:`, err);
    return empty(symbol);
  }
}
