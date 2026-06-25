/**
 * Pure parsing for TWSE rwd 除權除息預告 (exRight/TWT49U). The response is the
 * `{ fields: string[], data: unknown[][] }` shape: a per-day全市場 list of the
 * stocks going ex-dividend/ex-rights on 「資料日期」 (= the ex-date). Columns are
 * located by their `fields` NAME (basis C), never a positional index — the
 * column order is not contractual. The ex-date arrives as a Chinese ROC date
 * ("115年06月25日") so it is parsed with domain rocCnDate (NaN on malformed).
 * No I/O — the layered-architecture purity gate forbids it here.
 *
 * Unit note (C5): refPriceBefore/refPrice/value are price points in 元 (the raw
 * "2.800000" string for 權值+息值 is read as a plain number). kind is the raw
 * 「權/息」 label, narrowed to "權" | "息".
 */
import { cellNum } from "./rwd.js";
import { colIndex } from "./rwd.js";
import { rocCnDate } from "./twseDates.js";

/** One stock's ex-dividend / ex-rights event for a single ex-date. */
export interface ExDividend {
  /** 資料日期 (= 除權息交易日), epoch ms of UTC midnight; NaN when unparseable. */
  date: number;
  /** 除權息前收盤價, 元. */
  refPriceBefore: number | null;
  /** 除權息參考價, 元. */
  refPrice: number | null;
  /** 權值+息值, 元. */
  value: number | null;
  /** 權/息 別: 除權 → "權", 除息 → "息"; null for any other/blank label. */
  kind: "權" | "息" | null;
}

/** Narrow the raw 「權/息」 cell to the "權" | "息" union; null otherwise. */
function toKind(cell: unknown): "權" | "息" | null {
  const s = typeof cell === "string" ? cell.trim() : "";
  return s === "權" || s === "息" ? s : null;
}

/** Parse one TWT49U row given the response's `fields` header and the row array. */
export function parseExRightRow(
  fields: readonly unknown[],
  row: readonly unknown[],
): ExDividend {
  const dateIdx = colIndex(fields, "資料日期");
  const dateCell = dateIdx >= 0 ? row[dateIdx] : undefined;
  const date =
    typeof dateCell === "string" ? rocCnDate(dateCell) : Number.NaN;

  const kindIdx = colIndex(fields, "權/息");

  return {
    date,
    refPriceBefore: cellNum(fields, row, "除權息前收盤價"),
    refPrice: cellNum(fields, row, "除權息參考價"),
    value: cellNum(fields, row, "權值+息值"),
    kind: kindIdx >= 0 ? toKind(row[kindIdx]) : null,
  };
}
