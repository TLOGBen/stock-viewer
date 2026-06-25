/**
 * Pure parsing for TWSE opendata 月營收 (t187ap05_L). One snapshot row → one
 * MonthlyRevenue point; callers fold points into a per-symbol series via
 * upsertSeries over time. No I/O.
 *
 * Unit note (C5): 「營業收入-當月營收」 is in 千元 (thousands of NT$) — e.g. 1513's
 * 2026-05 value 2392022 = NT$2,392,022 thousand = 23.92 億. The field name
 * encodes the magnitude so downstream never re-scales by accident.
 */
import { num } from "./officialClose.js";
import { rocYYYMM } from "./twseDates.js";

/** One month of revenue for a single stock. */
export interface MonthlyRevenue {
  /** Gregorian year-month, "YYYY-MM" (e.g. "2026-05"). */
  yearMonth: string;
  /** 當月營收, in 千元. null when the cell is blank/"-". */
  revenueThousands: number | null;
  /** 上月比較增減 %, already a percentage. */
  momPct: number | null;
  /** 去年同月增減 %. */
  yoyPct: number | null;
  /** 今年累計較去年同期增減 %. */
  accYoyPct: number | null;
}

/**
 * Parse one t187ap05_L row. Returns null when 資料年月 cannot be parsed
 * (caller skips). ROC packed year-month "11505" → "2026-05".
 */
export function parseRevenueRow(
  row: Record<string, unknown>,
): MonthlyRevenue | null {
  const ym = rocYYYMM(typeof row["資料年月"] === "string" ? (row["資料年月"] as string) : "");
  if (ym == null) return null;
  return {
    yearMonth: `${ym.year}-${String(ym.month).padStart(2, "0")}`,
    revenueThousands: num(row["營業收入-當月營收"]),
    momPct: num(row["營業收入-上月比較增減(%)"]),
    yoyPct: num(row["營業收入-去年同月增減(%)"]),
    accYoyPct: num(row["累計營業收入-前期比較增減(%)"]),
  };
}
