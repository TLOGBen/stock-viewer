/**
 * Pure parsing for TWSE opendata 資產負債表 (t187ap07_L_{ci,basi,mim,fh,ins}).
 * One snapshot row (object with Chinese string keys) → BalanceSheet. No I/O.
 *
 * Variant note (C5/N1): the 一般 (ci) and 工業-保險票券 (mim) variants name their
 * totals 「資產總額／負債總額／權益總額」; the 金融 (basi/fh/ins) variants use
 * 「資產總計／負債總計／權益總計」. parseBalanceRow accepts either spelling so a
 * single parser covers all five endpoints.
 *
 * Unit note (C5): 資產/負債/權益 totals are in 千元 (thousands of NT$) — e.g. 1513
 * 2026Q1 資產總額 48754126 = NT$48,754,126 thousand ≈ 487.5 億. 每股參考淨值
 * (bvps) is a per-share NT$ value (e.g. 43.57), NOT 千元 — it is the only
 * non-千元 figure on the row.
 */
import { num } from "./officialClose.js";

/** Totals + per-share net value for the 個股頁 「資產負債」 block. */
export interface BalanceSheet {
  /** Reporting period, "YYYYQn" (e.g. "2026Q1"). */
  period: string;
  /** 資產總額/總計, in 千元. null when the cell is blank/"-". */
  totalAssets: number | null;
  /** 負債總額/總計, in 千元. */
  totalLiab: number | null;
  /** 權益總額/總計, in 千元. */
  totalEquity: number | null;
  /** 每股參考淨值 (book value per share), NT$ per share (not 千元). */
  bvps: number | null;
}

/**
 * Minimal shape of a parsed 損益表 (t187ap06_L) point that
 * computeRoeAndDebtRatio needs. Declared structurally here so this leaf does
 * not depend on the FinancialStatement leaf (sibling). The real
 * FinancialStatement type is a structural superset of this.
 */
export interface FinancialStatementLike {
  /** Reporting period, "YYYYQn" — the join key against BalanceSheet.period. */
  period: string;
  /** 稅後淨利 (net income after tax), in 千元. null when missing. */
  netIncome: number | null;
}

/** Read the first present cell among candidate column names; null if none. */
function firstNum(
  row: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const k of keys) {
    if (k in row) {
      const v = num(row[k]);
      if (v != null) return v;
    }
  }
  return null;
}

/**
 * Parse one t187ap07_L_* row. Returns null when 年度/季別 cannot be read
 * (caller skips). ROC 年度 "115" → Gregorian 2026; 季別 "1" → "2026Q1".
 * Accepts both the 總額 (ci/mim) and 總計 (basi/fh/ins) column spellings.
 */
export function parseBalanceRow(
  row: Record<string, unknown>,
): BalanceSheet | null {
  const rocYear = num(row["年度"]);
  const quarter = num(row["季別"]);
  if (rocYear == null || quarter == null) return null;
  const year = rocYear + 1911;
  return {
    period: `${year}Q${quarter}`,
    totalAssets: firstNum(row, ["資產總額", "資產總計"]),
    totalLiab: firstNum(row, ["負債總額", "負債總計"]),
    totalEquity: firstNum(row, ["權益總額", "權益總計"]),
    bvps: num(row["每股參考淨值"]),
  };
}

/**
 * Join a 損益表 point with a 資產負債表 point (already matched on
 * (公司代號, period=YYYYQn) by the caller) into the two derived ratios:
 *   負債比 (debtRatio) = 負債總額 / 資產總額
 *   ROE                = 稅後淨利 / 權益總額
 * Each ratio is null when its required figures are missing or the denominator
 * is zero, so a missing 損益表 yields roe=null and a missing 資產負債表 yields
 * both null. Ratios are plain fractions (multiply by 100 for a percentage).
 */
export function computeRoeAndDebtRatio(
  fin: FinancialStatementLike | null,
  bal: BalanceSheet | null,
): { roe: number | null; debtRatio: number | null } {
  const debtRatio =
    bal != null &&
    bal.totalLiab != null &&
    bal.totalAssets != null &&
    bal.totalAssets !== 0
      ? bal.totalLiab / bal.totalAssets
      : null;
  const roe =
    fin != null &&
    bal != null &&
    fin.netIncome != null &&
    bal.totalEquity != null &&
    bal.totalEquity !== 0
      ? fin.netIncome / bal.totalEquity
      : null;
  return { roe, debtRatio };
}
