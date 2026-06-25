/**
 * Pure parsing + band computation for the 估值河流圖 (PE & PB). Both ratios come
 * from the SAME BWIBBU_ALL row (PEratio + PBratio), so PE and PB share one
 * by-date accumulation and one band function (spec R-PB). No I/O.
 *
 * Unit note (C5): DividendYield "3.24" is a percentage value (3.24%), not 0.0324.
 * PEratio can be "" for stocks with no positive EPS (e.g. 台泥) → null, skipped.
 */
import { num } from "./officialClose.js";

/** One day's valuation ratios for a single stock (from one BWIBBU row). */
export interface ValuationPoint {
  /** Raw ROC packed date as reported, "1150624". */
  date: string;
  pe: number | null;
  pb: number | null;
  /** 殖利率 %, already a percentage. */
  dividendYieldPct: number | null;
}

/** River-chart band: quantile lines over a ratio series + current placement. */
export interface ValuationBand {
  count: number;
  min: number;
  max: number;
  p20: number;
  p40: number;
  p60: number;
  p80: number;
  current: number | null;
  /** 現價落點: cheap (≤p20) / fair / expensive (≥p80); null when no current. */
  zone: "cheap" | "fair" | "expensive" | null;
}

/** Parse one BWIBBU_ALL row → ValuationPoint. Empty ratio cells → null. */
export function parseBwibbuRow(
  row: Record<string, unknown>,
): ValuationPoint {
  return {
    date: typeof row["Date"] === "string" ? (row["Date"] as string) : "",
    pe: num(row["PEratio"]),
    pb: num(row["PBratio"]),
    dividendYieldPct: num(row["DividendYield"]),
  };
}

/**
 * Compute river-chart band lines from a ratio series (PE or PB — same logic).
 * null/non-finite points are dropped. Returns null for an empty effective
 * series (cold-start) so the UI can show the「累積中」 degraded state.
 */
export function bandFromSeries(
  values: ReadonlyArray<number | null>,
  current: number | null,
): ValuationBand | null {
  const xs = values
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (xs.length === 0) return null;

  const q = (p: number): number => {
    const idx = (xs.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const vlo = xs[lo] as number;
    const vhi = xs[hi] as number;
    return vlo + (vhi - vlo) * (idx - lo);
  };

  const p20 = q(0.2);
  const p80 = q(0.8);
  const cur = current != null && Number.isFinite(current) ? current : null;
  const zone =
    cur == null ? null : cur <= p20 ? "cheap" : cur >= p80 ? "expensive" : "fair";

  return {
    count: xs.length,
    min: xs[0] as number,
    max: xs[xs.length - 1] as number,
    p20,
    p40: q(0.4),
    p60: q(0.6),
    p80,
    current: cur,
    zone,
  };
}
