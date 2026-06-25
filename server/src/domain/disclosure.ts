/**
 * Pure parsing for TWSE opendata 即時重大訊息 (t187ap04_L). One announcement row
 * → one Disclosure. The official endpoint is the per-company material-disclosure
 * feed that replaces winvest's「相關新聞」(no view counts exist officially). No I/O.
 *
 * The endpoint is a whole-market snapshot of RECENT announcements (each row =
 * one announcement); a stock's history is built by accumulating daily snapshots
 * (bulkByDateCache) and de-duplicating. Note: the 主旨 column key carries a
 * trailing space in the live payload ("主旨 "), handled below.
 */

/** One material announcement for a single stock. */
export interface Disclosure {
  symbol: string;
  /** 發言日期, raw ROC packed "1150624". */
  dateRoc: string;
  /** epoch ms of 發言日期 (UTC midnight); NaN when unparseable. */
  date: number;
  /** 發言時間, raw "64502". */
  time: string;
  /** 主旨 (title). */
  subject: string;
  /** 事實發生日, raw ROC packed. */
  factDateRoc: string;
}

/** Trim a string cell; blank/missing/non-string → "". */
function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Parse a packed ROC date "1150624" (3-digit ROC year + MM + DD) → epoch ms of
 * UTC midnight. Returns NaN for malformed/out-of-range tokens.
 */
export function rocPackedDate(packed: string): number {
  const s = packed.trim();
  if (!/^\d{7}$/.test(s)) return Number.NaN;
  const rocYear = Number.parseInt(s.slice(0, 3), 10);
  const month = Number.parseInt(s.slice(3, 5), 10);
  const day = Number.parseInt(s.slice(5, 7), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return Number.NaN;
  return Date.UTC(rocYear + 1911, month - 1, day);
}

/** Parse one t187ap04_L row. Returns null when 公司代號 is missing (caller skips). */
export function parseDisclosureRow(
  row: Record<string, unknown>,
): Disclosure | null {
  const symbol = text(row["公司代號"]);
  if (symbol === "") return null;
  const dateRoc = text(row["發言日期"]);
  return {
    symbol,
    dateRoc,
    date: rocPackedDate(dateRoc),
    time: text(row["發言時間"]),
    // Live payload key has a trailing space ("主旨 "); accept both.
    subject: text(row["主旨 "] ?? row["主旨"]),
    factDateRoc: text(row["事實發生日"]),
  };
}
