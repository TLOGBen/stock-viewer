import type { MonthlyRevenue } from "../domain/index.js";
import type { RevenueCache } from "./stockPageDeps.js";

/**
 * usecase/getRevenue — resolve the 個股頁 「月營收」 block. The opendata ap05
 * directory only exposes the latest month for the whole market, so a stock's
 * history is built by folding each fresh snapshot into a per-symbol series
 * (cache B `upsertLatest`). On a cold start the series is a single point and the
 * UI shows 「歷史累積中(n 期)」; the usecase just returns whatever has accumulated.
 *
 * Never throws — a cache/fetch failure degrades to an empty series with
 * `coverage:false`.
 *
 * Unit note (C5): revenueThousands is 千元 (carried through from the domain
 * parser); the usecase does not re-scale.
 */

/** Narrow deps subset for getRevenue. */
export interface GetRevenueDeps {
  revenue: RevenueCache;
}

/** The 月營收 view: the accumulated series, ascending by month. */
export interface RevenueView {
  symbol: string;
  coverage: boolean;
  series: MonthlyRevenue[];
}

export async function getRevenue(
  deps: GetRevenueDeps,
  symbol: string,
): Promise<RevenueView> {
  try {
    // upsertLatest folds today's snapshot in (cold-start single point) and
    // returns the full accumulated series; it never throws on a null fetch.
    const series = await deps.revenue.upsertLatest(symbol);
    return { symbol, coverage: series.length > 0, series };
  } catch (err) {
    console.error(`[getRevenue] ${symbol} failed:`, err);
    // Fall back to whatever is already persisted (upsertLatest may have thrown
    // from the injected fetcher before writing); getSeries never throws.
    try {
      const series = await deps.revenue.getSeries(symbol);
      return { symbol, coverage: series.length > 0, series };
    } catch {
      return { symbol, coverage: false, series: [] };
    }
  }
}
