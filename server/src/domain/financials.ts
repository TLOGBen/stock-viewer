/**
 * Pure parsing for TWSE opendata 綜合損益表 (t187ap06_L_{ci,basi,mim,fh,ins}).
 * One snapshot row (object with Chinese string keys) → one FinancialStatement;
 * callers fold quarters into a per-symbol series via upsertSeries over time.
 * No I/O.
 *
 * The five endpoints share an identity header (年度/季別/公司代號) and the
 * 「基本每股盈餘（元）」 column, but their P&L lines diverge by industry variant
 * (R3): the 一般業 (`ci`) sheet carries 營業收入/營業毛利（毛損）/營業利益（損失），
 * whereas financial variants (`basi` 銀行業、`fh` 金控業、`mim` 票券業、`ins`
 * 保險業) replace or omit those lines. We resolve each numeric field by trying
 * the known column names in order and leave it null when the variant has none.
 *
 * Unit note (C5): all monetary lines are 仟元 (thousands of NT$) — e.g. 1513
 * 2026Q1 revenue 6490639 = NT$6,490,639 thousand = 64.9 億. EPS 「基本每股盈餘
 * （元）」 is in 元 (NT$ per share), already a plain number (e.g. 1.94), never
 * re-scaled.
 */
import { num } from "./officialClose.js";

/** Income-statement variant (the t187ap06_L_* suffix). */
export type FinancialVariant = "ci" | "basi" | "mim" | "fh" | "ins";

/** One quarter of income-statement figures for a single stock. */
export interface FinancialStatement {
  /** Gregorian year + quarter, "YYYYQn" (e.g. "2026Q1"). */
  period: string;
  /** 營業收入, in 仟元. null for financial variants without a revenue line. */
  revenue: number | null;
  /** 營業毛利（毛損）, in 仟元. null when the variant omits gross profit. */
  grossProfit: number | null;
  /** 營業利益（損失）, in 仟元. null when the variant omits operating income. */
  operatingIncome: number | null;
  /** 本期淨利（淨損）, in 仟元. null when the cell is blank. */
  netIncome: number | null;
  /** 基本每股盈餘（元）, in 元/share. null when the cell is blank/"-". */
  eps: number | null;
  /** Which t187ap06_L_* sheet this row came from. */
  variant: FinancialVariant;
}

/**
 * Resolve a numeric cell by trying candidate column names in order; first
 * present (non-blank after `num`) wins, else null. Variants spell the "same"
 * economic line differently, so callers pass every known alias.
 */
function pickNum(
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

/** Trim a string cell; blank/missing/non-string → "". */
function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Parse one t187ap06_L_* row for the given variant. Returns null when 年度 or
 * 季別 cannot be resolved (caller skips). ROC 年度 "115" + 1911 → 2026; period
 * "2026Q1". Revenue/grossProfit/operatingIncome are null on financial variants
 * that lack those lines; netIncome falls back across the per-variant aliases
 * (e.g. `fh` uses 「本期稅後淨利（淨損）」).
 */
export function parseFinStatementRow(
  row: Record<string, unknown>,
  variant: FinancialVariant,
): FinancialStatement | null {
  const rocYear = Number.parseInt(text(row["年度"]), 10);
  const quarter = Number.parseInt(text(row["季別"]), 10);
  if (!Number.isFinite(rocYear) || !Number.isFinite(quarter)) return null;
  if (quarter < 1 || quarter > 4) return null;

  return {
    period: `${rocYear + 1911}Q${quarter}`,
    revenue: pickNum(row, ["營業收入"]),
    grossProfit: pickNum(row, ["營業毛利（毛損）"]),
    operatingIncome: pickNum(row, ["營業利益（損失）"]),
    netIncome: pickNum(row, ["本期淨利（淨損）", "本期稅後淨利（淨損）"]),
    eps: pickNum(row, ["基本每股盈餘（元）"]),
    variant,
  };
}
