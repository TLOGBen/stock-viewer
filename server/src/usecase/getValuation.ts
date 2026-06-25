import type { ValuationPoint, ValuationBand } from "../domain/index.js";
import { bandFromSeries } from "../domain/index.js";
import type { ValuationSeriesCache } from "./stockPageDeps.js";

/**
 * usecase/getValuation — resolve the 個股頁 「估值河流圖」 block for BOTH PE and PB
 * (REQ-010). Both ratios live on the SAME BWIBBU row, so ONE per-symbol valuation
 * series (cache B) yields one ValuationPoint series, and PE and PB each feed the
 * SAME pure `bandFromSeries` (no second endpoint, no second cache — spec R-PB).
 *
 * Source change (REQ-002): drives the per-symbol `ValuationSeriesCache` (a long,
 * multi-year seeded history capped at VALUATION_SERIES_CAP) rather than
 * reconstructing a 60-day window from the whole-market by-date cache. The request
 * path calls `upsertLatest` so each request folds the fresh official BWIBBU day
 * into the series before reading; the full seeded history feeds bandFromSeries so
 * the river-chart band spans years. (getHealthLights.valuationFace keeps reading
 * getSeries to avoid a double daily fetch — getValuation owns the fold.)
 *
 * The current placement (現價落點) uses the MOST RECENT day's PE/PB as `current`
 * against the historical distribution. Empty PEratio/PBratio cells (e.g. 台泥's
 * blank PE) are null and dropped by `bandFromSeries`, so they neither distort
 * the band nor place a phantom current point.
 *
 * Date ordering: ROC packed dates are stored as variable-width strings
 * ("940103" for 民國94, "1150624" for 民國115) so lexicographic string sort is
 * WRONG ('9' > '1'). We sort a copy by `Number(date)` ascending then reverse to
 * newest-first.
 *
 * Cold start: a short series still draws a band (with few points) and the UI
 * shows 「估值歷史累積中」; an entirely empty series → both bands null +
 * coverage:false. Never throws.
 */

/** Narrow deps subset for getValuation. */
export interface GetValuationDeps {
  valuationSeries: ValuationSeriesCache;
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
): Promise<ValuationView> {
  try {
    // Fold today's official BWIBBU day into the seeded series on the request
    // path (mirrors getRevenue): upsertLatest fetches the per-symbol point,
    // dedup-by-date merges it, and returns the full accumulated series. It never
    // throws on a null fetch. If the injected fetcher REJECTS (network error) we
    // must NOT lose the seeded history → fall back to the persisted getSeries.
    let points: ValuationPoint[];
    try {
      points = await deps.valuationSeries.upsertLatest(symbol); // ascending
    } catch (err) {
      console.error(`[getValuation] ${symbol} continuation failed:`, err);
      points = await deps.valuationSeries.getSeries(symbol);
    }
    if (points.length === 0) return empty(symbol);

    // ROC packed dates have variable widths → numeric sort, never lexicographic.
    const newestFirst = [...points].sort(
      (a: ValuationPoint, b: ValuationPoint) => Number(a.date) - Number(b.date),
    );
    newestFirst.reverse();

    const series: ValuationDay[] = newestFirst.map((pt) => ({
      date: pt.date,
      pe: pt.pe,
      pb: pt.pb,
    }));

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
