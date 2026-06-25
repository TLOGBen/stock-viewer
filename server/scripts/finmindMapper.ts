/**
 * scripts/finmindMapper — BUILD-TIME ONLY pure transforms from FinMind v4 raw
 * rows to the existing domain types ValuationPoint / MonthlyRevenue.
 *
 * Like finmindClient, this lives in `server/scripts/` and MUST NEVER be imported
 * by anything under `server/src/` (runtime) — FinMind is a seed-only supplier
 * (CLAUDE.md invariant "不新增第三方資料供應商"). It is PURE: no fetch, no node:fs.
 *
 * Derivation policy (REQ-001 / REQ-004): mom/yoy/accYoy are NOT computed per-row.
 * Every revenue row is first mapped to a raw MonthlyRevenue (percentages null),
 * the array is sorted ascending by yearMonth, then `deriveRevenuePercents` runs
 * ONCE over the fully-assembled series — so a resumed/partial seed converges to
 * the same output as a single clean run.
 *
 * Unit decision (revenueThousands): FinMind TaiwanStockMonthRevenue.`revenue` is
 * in NTD (元); the domain field `MonthlyRevenue.revenueThousands` is in 千元. So
 * we divide by 1000. Verified against the known 1513 2026-05 value: published
 * 23.92億 = 2,392,022 千元 ⇒ FinMind reports 2,392,022,000 元 ⇒ /1000 = 2,392,022.
 */
import { num } from "../src/domain/officialClose.js";
import type { MonthlyRevenue } from "../src/domain/revenue.js";
import { deriveRevenuePercents } from "../src/domain/revenueDerive.js";
import { gregorianToRocPacked } from "../src/domain/twseDates.js";
import type { ValuationPoint } from "../src/domain/valuation.js";

/** One raw FinMind TaiwanStockPER row (only the fields we consume). */
export interface FinmindPerRow {
  date?: unknown;
  PER?: unknown;
  PBR?: unknown;
  dividend_yield?: unknown;
}

/** One raw FinMind TaiwanStockMonthRevenue row (only the fields we consume). */
export interface FinmindRevenueRow {
  date?: unknown;
  revenue?: unknown;
  revenue_year?: unknown;
  revenue_month?: unknown;
}

/**
 * Map FinMind TaiwanStockPER rows → ValuationPoint[]. The Gregorian "YYYY-MM-DD"
 * date is converted to the ROC-packed form ValuationPoint.date stores; a row
 * whose date cannot be parsed is skipped. PER/PBR/dividend_yield are coerced via
 * the shared `num` helper (blank/absent → null). Pure.
 */
export function mapPerRows(rows: readonly FinmindPerRow[]): ValuationPoint[] {
  const out: ValuationPoint[] = [];
  for (const row of rows) {
    const rawDate = typeof row.date === "string" ? row.date : "";
    const date = gregorianToRocPacked(rawDate);
    if (date == null) continue;
    out.push({
      date,
      pe: num(row.PER),
      pb: num(row.PBR),
      dividendYieldPct: num(row.dividend_yield),
    });
  }
  return out;
}

/** Build a "YYYY-MM" key from a revenue row's year/month, falling back to date. */
function yearMonthOf(row: FinmindRevenueRow): string | null {
  const year = num(row.revenue_year);
  const month = num(row.revenue_month);
  if (year != null && month != null && month >= 1 && month <= 12) {
    return `${year}-${String(month).padStart(2, "0")}`;
  }
  // fallback: derive from the FinMind announce date "YYYY-MM-DD".
  if (typeof row.date === "string") {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(row.date.trim());
    if (m != null) return `${m[1]}-${m[2]}`;
  }
  return null;
}

/**
 * Map FinMind TaiwanStockMonthRevenue rows → MonthlyRevenue[], deriving
 * mom/yoy/accYoy ONCE over the fully-assembled, ascending-sorted series (never
 * per-row). FinMind's monthly-revenue endpoint supplies only raw revenue (元),
 * so all percentages are derived — there are no cumulative/yoy columns to
 * pass-through here. Rows with an unparseable year-month are skipped. Pure.
 */
export function mapMonthRevenueRows(
  rows: readonly FinmindRevenueRow[],
): MonthlyRevenue[] {
  const raw: MonthlyRevenue[] = [];
  for (const row of rows) {
    const yearMonth = yearMonthOf(row);
    if (yearMonth == null) continue;
    const revenueYuan = num(row.revenue);
    raw.push({
      yearMonth,
      // 元 → 千元 (see unit decision in the module header).
      revenueThousands: revenueYuan == null ? null : revenueYuan / 1000,
      momPct: null,
      yoyPct: null,
      accYoyPct: null,
    });
  }

  raw.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  return deriveRevenuePercents(raw);
}
