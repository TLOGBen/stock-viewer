/**
 * Pure presentational transforms for DividendTable.vue (股利政策).
 *
 * Keeps the .vue lean and unit-testable. All functions are pure and immutable —
 * they never mutate their inputs and never touch IO.
 *
 * 單位量綱: cashDividend / stockDividend are 元/股 (NT$ per share), already in
 * final units upstream (domain parseDividendRow). We only format, never
 * re-scale. resolutionDate is a ROC packed "YYYMMDD" label as reported;
 * exDividend.date is an epoch-ms timestamp (NaN when unparseable).
 *
 * Note: dividend amounts are NOT 漲跌 — they carry no 紅漲綠跌 semantics, so the
 * value cells stay plain mono (unlike the institutional/revenue 增減 columns).
 */
import type { Dividend, ExDividend } from "~/types";

/** Em-dash placeholder shown for any blank / unknown / null field. */
export const DIV_BLANK = "—";

/** A fully shaped dividend table row (one 年度/期別). */
export interface DividendRow {
  /** Stable v-for key (year + period). */
  readonly key: string;
  /** 股利年度 label (ROC year string as reported). */
  readonly year: string;
  /** 現金股利, formatted 元/股 or「—」. */
  readonly cash: string;
  /** 股票股利, formatted 元/股 or「—」. */
  readonly stock: string;
  /** 決議日 "YYY/MM/DD" (ROC), or「—」when unparseable. */
  readonly resolution: string;
}

/** Format a NT$/share dividend figure. null/non-finite →「—」. */
export function formatShareAmount(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return DIV_BLANK;
  return value.toFixed(2);
}

/**
 * Format a ROC packed "YYYMMDD" (e.g. "1130612") as "YYY/MM/DD". Anything that
 * is not 7 digits is treated as unknown and rendered as「—」 (the raw string is
 * never reinterpreted). Note ROC years are 3 digits (民國 100+).
 */
export function formatRocPacked(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!/^\d{7}$/.test(trimmed)) return DIV_BLANK;
  return `${trimmed.slice(0, 3)}/${trimmed.slice(3, 5)}/${trimmed.slice(5, 7)}`;
}

/**
 * Format an epoch-ms ex-dividend date as "YYYY-MM-DD" in Taipei time (UTC+8, no
 * DST). NaN / non-finite →「—」. Used for the 最近一次除權息日 line.
 */
export function formatExDate(epochMs: number | null | undefined): string {
  if (epochMs == null || !Number.isFinite(epochMs)) return DIV_BLANK;
  const TPE_OFFSET_MS = 8 * 60 * 60 * 1000;
  const d = new Date(epochMs + TPE_OFFSET_MS);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Shape the API dividend series into newest-first display rows. The source is
 * left untouched; a defensive copy is sorted descending by (year, period) so the
 * latest 年度 sits on top regardless of upstream ordering.
 */
export function toDividendRows(series: readonly Dividend[]): DividendRow[] {
  return [...series]
    .sort((a, b) => {
      const byYear = b.year.localeCompare(a.year);
      return byYear !== 0 ? byYear : b.period.localeCompare(a.period);
    })
    .map((d) => ({
      key: `${d.year}-${d.period}`,
      year: d.year.trim().length > 0 ? d.year.trim() : DIV_BLANK,
      cash: formatShareAmount(d.cashDividend),
      stock: formatShareAmount(d.stockDividend),
      resolution: formatRocPacked(d.resolutionDate),
    }));
}

/**
 * Build the 最近一次除權息日 summary line from the envelope's latest ExDividend,
 * or null when none is available. Returns a small display object (date + an
 * optional 除權/除息 kind tag) so the .vue can render it without touching dates.
 */
export interface ExDividendSummary {
  /** "YYYY-MM-DD" or「—」. */
  readonly date: string;
  /** "除權" / "除息" / "" derived from kind. */
  readonly kindLabel: string;
}

export function toExSummary(ex: ExDividend | null | undefined): ExDividendSummary | null {
  if (ex == null) return null;
  const date = formatExDate(ex.date);
  if (date === DIV_BLANK) return null;
  const kindLabel = ex.kind === "權" ? "除權" : ex.kind === "息" ? "除息" : "";
  return { date, kindLabel };
}
