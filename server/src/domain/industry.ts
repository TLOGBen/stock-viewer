/**
 * Pure mapping for the TWSE 上市 「產業別」 code carried on t187ap03_L
 * (CompanyProfile.industryCode, e.g. "05"). No I/O — the layered-architecture
 * purity gate forbids it here.
 *
 * Two responsibilities, both pure constants:
 *   1. industryVariant(code) → 'ci' | 'financial' — a *two-way* split only.
 *      The single 「金融保險業」 code ("17") covers 銀行/證券/金控/保險 alike, so
 *      the code alone CANNOT distinguish the four financial sub-variants
 *      (_basi/_mim/_fh/_ins). That sub-variant decision is made by the usecase
 *      via endpoint membership lookup (which list the symbol appears in), never
 *      by hard-mapping the industry code (R-feasibility / TASK-shared). So
 *      'financial' here means only "needs usecase membership lookup".
 *   2. industryName(code) → Chinese 產業別 name (缺碼 / 未知碼 → the raw code).
 */

/**
 * The single TWSE 上市 「金融保險業」 產業別 code. Verified live against
 * t187ap03_L: every 金控/銀行/保險/證券 sample (2880 華南金, 2882 國泰金,
 * 2884 玉山金, 2885 元大金, 2891 中信金, 2801 彰銀, 5880 合庫金, 2816 旺旺保…)
 * reports 產業別 = "17", while general stocks differ (1101 台泥="01",
 * 1513 中興電="05", 2330 台積電="24"). Kept as a Set so adding any future
 * financial code is a one-line change without touching the branch logic.
 */
const FINANCIAL_INDUSTRY_CODES: ReadonlySet<string> = new Set(["17"]);

/**
 * TWSE 上市 「產業別」 code → Chinese name. Verified live against t187ap03_L by
 * sampling representative members per code (e.g. "01"→台泥/亞泥/嘉泥=水泥,
 * "17"→彰銀/台中銀/旺旺保=金融保險, "28"→鴻海/信錦=電子零組件,
 * "91"→美德醫療-DR=存託憑證). Codes TWSE does not currently use (07/13/19/32/34
 * etc.) are intentionally absent — an unknown code falls back to its raw value.
 */
const INDUSTRY_NAMES: Readonly<Record<string, string>> = {
  "01": "水泥工業",
  "02": "食品工業",
  "03": "塑膠工業",
  "04": "紡織纖維",
  "05": "電機機械",
  "06": "電器電纜",
  "08": "玻璃陶瓷",
  "09": "造紙工業",
  "10": "鋼鐵工業",
  "11": "橡膠工業",
  "12": "汽車工業",
  "14": "建材營造業",
  "15": "航運業",
  "16": "觀光餐旅",
  "17": "金融保險業",
  "18": "貿易百貨業",
  "20": "其他業",
  "21": "化學工業",
  "22": "生技醫療業",
  "23": "油電燃氣業",
  "24": "半導體業",
  "25": "電腦及週邊設備業",
  "26": "光電業",
  "27": "通信網路業",
  "28": "電子零組件業",
  "29": "電子通路業",
  "30": "資訊服務業",
  "31": "其他電子業",
  "35": "綠能環保",
  "36": "數位雲端",
  "37": "運動休閒",
  "38": "居家生活",
  "91": "存託憑證",
};

/** A normalized industry code: trimmed string ("" when absent). */
function normalize(code: string): string {
  return typeof code === "string" ? code.trim() : "";
}

/**
 * Two-way industry split. A 金融保險業 code → 'financial' (the usecase then
 * resolves the _basi/_mim/_fh/_ins sub-variant by membership lookup); anything
 * else, including a missing/blank/unknown code, → 'ci'.
 */
export function industryVariant(industryCode: string): "ci" | "financial" {
  return FINANCIAL_INDUSTRY_CODES.has(normalize(industryCode))
    ? "financial"
    : "ci";
}

/**
 * Map a 產業別 code to its Chinese name. An unknown or blank code returns its
 * own raw (normalized) value so the UI degrades to showing the code itself
 * rather than an empty cell.
 */
export function industryName(industryCode: string): string {
  const code = normalize(industryCode);
  return INDUSTRY_NAMES[code] ?? code;
}
