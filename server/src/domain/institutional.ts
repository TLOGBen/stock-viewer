/**
 * Pure parsing for TWSE rwd 三大法人買賣超日報 (fund/T86). Each row is a
 * column-ordered array; columns are located by `fields` name (basis C). Net
 * share counts are converted 股 → 張 (÷1000). 外資 = 外陸資(不含外資自營商) +
 * 外資自營商 (the latter is 0 on most days). No I/O.
 *
 * Unit note (C5): T86 nets are in 股; this parser returns 張.
 */
import { cellNum } from "./rwd.js";

const SHARES_PER_LOT = 1000;

/** One day's three-major-investor net buy/sell for a single stock, in 張. */
export interface InstitutionalFlow {
  /** 外資 (外陸資不含外資自營商 + 外資自營商), 張. */
  foreignNet: number | null;
  /** 投信, 張. */
  trustNet: number | null;
  /** 自營商 (合計), 張. */
  dealerNet: number | null;
  /** 三大法人合計, 張. */
  totalNet: number | null;
}

/** 股 → 張. null stays null (column absent / blank). */
function toLots(shares: number | null): number | null {
  return shares == null ? null : shares / SHARES_PER_LOT;
}

/** Parse one T86 row given the response's `fields` header and the row array. */
export function parseT86Row(
  fields: readonly unknown[],
  row: readonly unknown[],
): InstitutionalFlow {
  const foreignMain = cellNum(fields, row, "外陸資買賣超股數(不含外資自營商)");
  const foreignDealer = cellNum(fields, row, "外資自營商買賣超股數");
  const trust = cellNum(fields, row, "投信買賣超股數");
  const dealer = cellNum(fields, row, "自營商買賣超股數");
  const total = cellNum(fields, row, "三大法人買賣超股數");

  const foreign =
    foreignMain == null && foreignDealer == null
      ? null
      : (foreignMain ?? 0) + (foreignDealer ?? 0);

  return {
    foreignNet: toLots(foreign),
    trustNet: toLots(trust),
    dealerNet: toLots(dealer),
    totalNet: toLots(total),
  };
}
