/**
 * domain/revenueDerive — pure derivation of mom/yoy/accYoy percentages from a
 * complete monthly-revenue series. No I/O.
 *
 * The runtime path (parseRevenueRow) reads these percentages straight from TWSE
 * t187ap05_L fields. The build-time FinMind seed has only raw revenue, so it
 * derives them here over the FULLY-ASSEMBLED series (a single pass after merge),
 * never per-row during a resumable fold — that keeps a resumed/partial seed's
 * output byte-identical to a single clean run (REQ-001 Scenario 3).
 *
 * accYoy is TWSE's cumulative-YTD-vs-prior-year-cumulative definition: it needs
 * EVERY month Jan→M of BOTH the current and prior year present and non-null;
 * any gap → null (never approximated — REQ-004 Scenario 2).
 */
import type { MonthlyRevenue } from "./revenue.js";

interface YM {
  year: number;
  month: number;
}

/** Parse a "YYYY-MM" key. Returns null for anything else. */
function parseYearMonth(ym: string): YM | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (m == null) return null;
  const year = Number.parseInt(m[1] as string, 10);
  const month = Number.parseInt(m[2] as string, 10);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function key(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Round to 2 decimals to match TWSE's published percentage precision. */
function pct(numer: number, denom: number): number | null {
  if (denom === 0) return null;
  return Math.round((numer / denom) * 100 * 100) / 100;
}

/**
 * Sum revenue for months Jan→`upto` of `year` from `rev`. Returns null if ANY
 * constituent month is missing (so a partial year never yields a wrong YTD).
 */
function ytd(rev: ReadonlyMap<string, number>, year: number, upto: number): number | null {
  let sum = 0;
  for (let m = 1; m <= upto; m++) {
    const v = rev.get(key(year, m));
    if (v == null) return null;
    sum += v;
  }
  return sum;
}

/**
 * Return a new series with momPct/yoyPct/accYoyPct computed from each point's
 * revenueThousands. Pure: input is not mutated. Insufficient data → null for
 * that field (never approximated).
 */
export function deriveRevenuePercents(
  series: readonly MonthlyRevenue[],
): MonthlyRevenue[] {
  const rev = new Map<string, number>();
  for (const it of series) {
    if (it.revenueThousands != null) rev.set(it.yearMonth, it.revenueThousands);
  }

  return series.map((it) => {
    const ym = parseYearMonth(it.yearMonth);
    const cur = it.revenueThousands;
    if (ym == null || cur == null) {
      return { ...it, momPct: null, yoyPct: null, accYoyPct: null };
    }

    // mom: immediately-prior month
    const prevM = ym.month === 1 ? key(ym.year - 1, 12) : key(ym.year, ym.month - 1);
    const prevMonthVal = rev.get(prevM);
    const momPct = prevMonthVal != null ? pct(cur - prevMonthVal, prevMonthVal) : null;

    // yoy: same month, prior year
    const prevYearVal = rev.get(key(ym.year - 1, ym.month));
    const yoyPct = prevYearVal != null ? pct(cur - prevYearVal, prevYearVal) : null;

    // accYoy: cumulative YTD vs prior-year cumulative YTD (both must be complete)
    const curYtd = ytd(rev, ym.year, ym.month);
    const prevYtd = ytd(rev, ym.year - 1, ym.month);
    const accYoyPct =
      curYtd != null && prevYtd != null ? pct(curYtd - prevYtd, prevYtd) : null;

    return { ...it, momPct, yoyPct, accYoyPct };
  });
}
