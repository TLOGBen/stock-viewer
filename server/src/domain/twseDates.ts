/**
 * Pure parsers for the two ROC-calendar date formats TWSE emits across the
 * opendata/rwd surfaces this app consumes:
 *   - opendata 「資料年月」 packed as "11505" (YYYMM: 3-digit ROC year + 2-digit month)
 *   - rwd exRight 「資料日期」 as "115年06月25日" (Chinese ROC year/month/day)
 * ROC year + 1911 = Gregorian year. Each format needs its own parser (R3).
 * Malformed input is rejected: rocYYYMM → null, rocCnDate → NaN (matching the
 * rocDateToEpoch convention in history.ts so row parsers can skip uniformly).
 * No I/O — the layered-architecture purity gate forbids it here.
 */

/** A resolved Gregorian year + month (1-based month). */
export interface YearMonth {
  year: number;
  month: number;
}

/**
 * Parse an opendata packed ROC year-month like "11505" → { year: 2026, month: 5 }.
 * Accepts 4–6 digits (last two = month, the rest = ROC year, so a zero-padded
 * "09905" and a bare "9905" both resolve). Returns null for malformed tokens or
 * an out-of-range month.
 */
export function rocYYYMM(packed: string): YearMonth | null {
  const s = packed.trim();
  if (!/^\d{4,6}$/.test(s)) return null;
  const monthStr = s.slice(-2);
  const yearStr = s.slice(0, -2);
  const rocYear = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  if (!Number.isFinite(rocYear) || !Number.isFinite(month)) return null;
  if (month < 1 || month > 12) return null;
  return { year: rocYear + 1911, month };
}

/**
 * Parse a Chinese ROC date like "115年06月25日" → epoch ms of that day's UTC
 * midnight. Tolerates unpadded month/day ("115年6月5日"). Returns NaN for any
 * malformed token or out-of-range field so callers can skip the row.
 */
export function rocCnDate(text: string): number {
  const m = text.trim().match(/^(\d{1,3})年(\d{1,2})月(\d{1,2})日$/);
  if (m == null) return Number.NaN;
  const rocYear = Number.parseInt(m[1] as string, 10);
  const month = Number.parseInt(m[2] as string, 10);
  const day = Number.parseInt(m[3] as string, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return Number.NaN;
  return Date.UTC(rocYear + 1911, month - 1, day);
}
