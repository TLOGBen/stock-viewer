/**
 * Pure parsing for TWSE opendata 公司基本資料 (t187ap03_L). One snapshot row
 * (object with Chinese string keys) → CompanyProfile. No I/O. 「經營業務」 is
 * intentionally absent — this endpoint carries no such field (see spec §0/N1).
 */

/** Identity + 股務 fields for the 個股頁 「公司基本資料」 block. */
export interface CompanyProfile {
  symbol: string;
  shortName: string;
  chairman: string;
  ceo: string;
  /** Raw 產業別 code (e.g. "05"); mapped to a Chinese name in the usecase. */
  industryCode: string;
  taxId: string;
  /** As reported, "YYYYMMDD" (e.g. "19560501"). */
  foundDate: string;
  listDate: string;
  website: string;
  transferAgent: string;
}

/** Trim a string cell; blank/missing/non-string → "". */
function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Parse one t187ap03_L row. Returns null when 公司代號 is missing (caller skips).
 * 統編 is kept as the raw string (an identifier, not a quantity).
 */
export function parseCompanyRow(
  row: Record<string, unknown>,
): CompanyProfile | null {
  const symbol = text(row["公司代號"]);
  if (symbol === "") return null;
  return {
    symbol,
    shortName: text(row["公司簡稱"]),
    chairman: text(row["董事長"]),
    ceo: text(row["總經理"]),
    industryCode: text(row["產業別"]),
    taxId: text(row["營利事業統一編號"]),
    foundDate: text(row["成立日期"]),
    listDate: text(row["上市日期"]),
    website: text(row["網址"]),
    transferAgent: text(row["股票過戶機構"]),
  };
}
