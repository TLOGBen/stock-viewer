/**
 * Pure presentation helpers for the 月營收表 (RevenueTable). No Vue, no I/O —
 * unit-testable in the plain-node vitest env (mirrors utils/format.ts).
 *
 * 單位量綱: MonthlyRevenue.revenueThousands is 當月營收 in 千元 (thousands of
 * TWD). 月增/年增/累計 are already percentages. 紅漲綠跌: a positive 增減 is
 * bullish → c-up (red); negative → c-down (green); zero/null → c-flat (grey).
 */
import type { MonthlyRevenue } from "~/types";

/** 1 億 = 100,000 千元 (10^8 TWD = 10^5 thousand-TWD). */
const THOUSANDS_PER_YI = 100_000;

const groupFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const yiFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format 當月營收 (千元) for the table. Large figures (≥ 1 億 worth of 千元)
 * collapse to a "N.NN 億" reading; smaller ones stay thousands-separated 千元.
 * null/non-finite → em-dash.
 */
export function formatRevenue(thousands: number | null): string {
  if (thousands === null || !Number.isFinite(thousands)) return "—";
  if (Math.abs(thousands) >= THOUSANDS_PER_YI) {
    return `${yiFormatter.format(thousands / THOUSANDS_PER_YI)} 億`;
  }
  return `${groupFormatter.format(thousands)} 千`;
}

/**
 * Format a 增減 percentage (月增/年增/累計) with an explicit sign and trailing
 * "%". 0 renders as plain "0.00%"; null/non-finite → em-dash.
 */
export function formatRevenuePct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  if (pct === 0) return "0.00%";
  const sign = pct > 0 ? "+" : "-";
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

/**
 * Semantic colour class for a 增減 value (紅漲綠跌): positive → c-up (red),
 * negative → c-down (green), zero/null → c-flat (grey).
 */
export function pctSignClass(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct) || pct === 0) return "c-flat";
  return pct > 0 ? "c-up" : "c-down";
}

/**
 * Render the Gregorian "YYYY-MM" yearMonth as a compact "YYYY/MM" label for the
 * 年月 column. A malformed value is passed through unchanged.
 */
export function formatYearMonth(yearMonth: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  return m ? `${m[1]}/${m[2]}` : yearMonth;
}

/**
 * Slice a revenue series into a single page, newest-first. Pure: returns a new
 * array. `page` is 1-based; out-of-range pages clamp to an empty/last window via
 * the caller's `pageCount`, but this helper just slices what it's given.
 */
export function pageSlice<T>(rows: readonly T[], page: number, size: number): T[] {
  const start = (page - 1) * size;
  return rows.slice(start, start + size);
}

/** Total page count for `total` rows at `size` per page (≥ 1). */
export function pageCount(total: number, size: number): number {
  if (size <= 0) return 1;
  return Math.max(1, Math.ceil(total / size));
}

/**
 * Order a revenue series newest-first by yearMonth (lexical sort works for
 * zero-padded "YYYY-MM"). Returns a new array; never mutates the input.
 */
export function sortNewestFirst(series: readonly MonthlyRevenue[]): MonthlyRevenue[] {
  return [...series].sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
}
