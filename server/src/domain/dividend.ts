/**
 * Pure parsing for TWSE opendata 股利分派 (t187ap45_L). One snapshot row →
 * one Dividend point; callers fold points into a per-symbol series via
 * upsertSeries (key = 股利年度 + 期別). No I/O.
 *
 * Field notes (probed live against t187ap45_L, see test fixture):
 *  - This endpoint carries NO 除權息交易日 (ex-dividend date); N2 sources that
 *    separately from rwd TWT49U in the usecase. Here we only expose the board
 *    resolution date (董事會（擬議）股利分派日).
 *  - There is no single 現金股利 / 股票股利 column. Cash dividend is split across
 *    three 元/股 columns (盈餘分配 / 法定盈餘公積 / 資本公積) and stock dividend
 *    across three 配股 columns (盈餘轉增資 / 法定盈餘公積轉增資 / 資本公積轉增資);
 *    each must be summed.
 *
 * Unit note (C5): cashDividend / stockDividend are 元/股 (NT$ per share),
 * already per-share — never re-scale. e.g. 1513 114年度 = 6.00 元/股 cash,
 * 0 stock (all cash from 盈餘分配).
 */
import { num } from "./officialClose.js";

/** One dividend distribution period for a single stock. */
export interface Dividend {
  /** 股利年度 as reported, e.g. "114" (ROC year, kept raw — a label). */
  year: string;
  /** 期別, e.g. "1" (kept raw; combines with year as the upsert key). */
  period: string;
  /** Sum of the three 元/股 cash columns. null when all are blank. */
  cashDividend: number | null;
  /** Sum of the three 元/股 配股 columns. null when all are blank. */
  stockDividend: number | null;
  /** 董事會（擬議）股利分派日 as reported, ROC packed "YYYMMDD" (e.g. "1150310"). */
  resolutionDate: string;
}

/** Trim a string cell; blank/missing/non-string → "". */
function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Sum a set of numeric cells. Returns null only when every cell is blank/"-"
 * (so a genuinely absent value stays null), otherwise the sum of the present
 * cells (treating individual blanks as 0).
 */
function sumCells(values: unknown[]): number | null {
  let any = false;
  let total = 0;
  for (const v of values) {
    const n = num(v);
    if (n != null) {
      any = true;
      total += n;
    }
  }
  return any ? total : null;
}

/**
 * Parse one t187ap45_L row. Returns null when 股利年度 is missing (caller skips).
 * Cash and stock dividends are each summed across their three component columns.
 */
export function parseDividendRow(
  row: Record<string, unknown>,
): Dividend | null {
  const year = text(row["股利年度"]);
  if (year === "") return null;
  return {
    year,
    period: text(row["期別"]),
    cashDividend: sumCells([
      row["股東配發-盈餘分配之現金股利(元/股)"],
      row["股東配發-法定盈餘公積發放之現金(元/股)"],
      row["股東配發-資本公積發放之現金(元/股)"],
    ]),
    stockDividend: sumCells([
      row["股東配發-盈餘轉增資配股(元/股)"],
      row["股東配發-法定盈餘公積轉增資配股(元/股)"],
      row["股東配發-資本公積轉增資配股(元/股)"],
    ]),
    resolutionDate: text(row["董事會（擬議）股利分派日"]),
  };
}
