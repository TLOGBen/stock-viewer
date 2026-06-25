/**
 * Pure transforms for FinancialsTable. No Vue, no I/O — unit-testable in the
 * plain-node vitest env (mirrors utils/format.ts).
 *
 * The backend `/api/financials/:symbol` envelope (FinancialsView) carries a
 * single most-recent quarter: an income `statement` (仟元 amounts + EPS 元),
 * a `balance` sheet (千元 amounts + bvps 元), and two derived ratios
 * (`debtRatio`, `roe`) expressed as fractions (×100 for %). These helpers shape
 * that view into the row lists the 損益 / 財務比率 sub-tabs render — they never
 * re-scale the wire amounts (units are encoded in the field names).
 */
import type { FinancialsView } from "~/types";

/** 1 億 = 100,000 仟元 (10^8 TWD = 10^5 thousand-TWD). 仟元 == 千元 scale. */
const THOUSANDS_PER_YI = 100_000;

const yiFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const groupFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/**
 * Format a 仟元 income-statement magnitude for the 損益 table. Large figures
 * (≥ 1 億 worth of 仟元) collapse to "N.NN 億"; smaller ones stay
 * thousands-separated 仟. null/non-finite → em-dash. Mirrors revenueFormat so
 * the two tables read identically.
 */
export function formatThousands(thousands: number | null): string {
  if (thousands === null || !Number.isFinite(thousands)) return "—";
  if (Math.abs(thousands) >= THOUSANDS_PER_YI) {
    return `${yiFormatter.format(thousands / THOUSANDS_PER_YI)} 億`;
  }
  return `${groupFormatter.format(thousands)} 仟`;
}

/** Format EPS (元/share) — fixed 2dp, em-dash on null/non-finite. */
export function formatEps(eps: number | null): string {
  if (eps === null || !Number.isFinite(eps)) return "—";
  return `${eps.toFixed(2)} 元`;
}

/** Format a ratio percentage (already ×100) with trailing "%". null → em-dash. */
export function formatRatioPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  return `${pct.toFixed(2)}%`;
}

/** A single income-statement line in the 損益 sub-tab. `thousands` is in 仟元. */
export interface IncomeRow {
  label: string;
  /** Amount in 仟元 (null when the source figure is blank). */
  thousands: number | null;
  /** true when this row is EPS (元/share), so the view formats it as a price. */
  isEps?: boolean;
}

/** A single ratio line in the 財務比率 sub-tab. `pct` is already a percentage. */
export interface RatioRow {
  label: string;
  /** Percentage value (e.g. 23.4 for 23.4%), or null when unknown. */
  pct: number | null;
}

/**
 * 損益表 rows for the income sub-tab, in reporting order. EPS is kept as a
 * distinct row (元/share, flagged `isEps`) so the view formats it differently
 * from the 仟元 magnitudes. Returns an empty list when there is no statement.
 */
export function incomeRows(view: FinancialsView | null): IncomeRow[] {
  const s = view?.statement;
  if (!s) return [];
  return [
    { label: "營業收入", thousands: s.revenue },
    { label: "營業毛利", thousands: s.grossProfit },
    { label: "營業利益", thousands: s.operatingIncome },
    { label: "本期淨利", thousands: s.netIncome },
    { label: "基本每股盈餘", thousands: s.eps, isEps: true },
  ];
}

/**
 * 毛利率 = 營業毛利 / 營業收入 × 100, as a percentage. null when revenue is
 * missing/zero or gross profit is missing. Pure — no rounding beyond float.
 */
export function grossMarginPct(view: FinancialsView | null): number | null {
  const s = view?.statement;
  if (!s || s.revenue == null || s.grossProfit == null || s.revenue === 0) {
    return null;
  }
  return (s.grossProfit / s.revenue) * 100;
}

/**
 * 營益率 = 營業利益 / 營業收入 × 100, as a percentage. null when revenue is
 * missing/zero or operating income is missing.
 */
export function operatingMarginPct(view: FinancialsView | null): number | null {
  const s = view?.statement;
  if (
    !s ||
    s.revenue == null ||
    s.operatingIncome == null ||
    s.revenue === 0
  ) {
    return null;
  }
  return (s.operatingIncome / s.revenue) * 100;
}

/**
 * 淨利率 = 本期淨利 / 營業收入 × 100, as a percentage. null when revenue is
 * missing/zero or net income is missing.
 */
export function netMarginPct(view: FinancialsView | null): number | null {
  const s = view?.statement;
  if (!s || s.revenue == null || s.netIncome == null || s.revenue === 0) {
    return null;
  }
  return (s.netIncome / s.revenue) * 100;
}

/**
 * 財務比率 rows for the ratio sub-tab. Margins are derived from the income
 * statement; 負債比率 (`debtRatio`) and 股東權益報酬率 (`roe`) come pre-computed
 * from the view as fractions and are scaled ×100 here for display.
 */
export function ratioRows(view: FinancialsView | null): RatioRow[] {
  if (!view) return [];
  return [
    { label: "毛利率", pct: grossMarginPct(view) },
    { label: "營益率", pct: operatingMarginPct(view) },
    { label: "淨利率", pct: netMarginPct(view) },
    {
      label: "負債比率",
      pct: view.debtRatio == null ? null : view.debtRatio * 100,
    },
    { label: "股東權益報酬率", pct: view.roe == null ? null : view.roe * 100 },
  ];
}
