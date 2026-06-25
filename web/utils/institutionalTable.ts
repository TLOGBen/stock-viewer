/**
 * Pure presentational transforms for InstitutionalTable.vue (三大法人).
 *
 * Keeps the .vue lean and unit-testable. All functions are pure and immutable —
 * they never mutate their inputs and never touch IO.
 *
 * Unit 量綱: every net figure is 張 (lots), already converted upstream
 * (domain parseT86Row divides 股→張 /1000). We only format, never re-scale.
 */
import type { InstitutionalDay } from "~/types";
import { formatInt, signClass } from "~/utils/format";

/** One display cell: the raw (signed) lot value plus its rendered text + colour. */
export interface FlowCell {
  /** Underlying signed 張 value, or null when the source column was blank. */
  readonly value: number | null;
  /** Thousands-separated text, or「—」when null. */
  readonly text: string;
  /** 紅漲綠跌 colour class: 正=c-up(紅) 負=c-down(綠) 0/null=c-flat. */
  readonly cls: string;
}

/** A fully shaped table row: pretty date + four signed flow cells. */
export interface InstitutionalRow {
  /** Original "YYYYMMDD" key (stable v-for key). */
  readonly date: string;
  /** Display date "YYYY-MM-DD"; passes through unrecognised input untouched. */
  readonly dateLabel: string;
  readonly foreign: FlowCell;
  readonly trust: FlowCell;
  readonly dealer: FlowCell;
  readonly total: FlowCell;
}

/** Format an "YYYYMMDD" key as "YYYY-MM-DD"; non-8-digit input passes through. */
export function formatTradeDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** Shape one signed 張 figure into a {value,text,cls} display cell. */
export function toFlowCell(value: number | null): FlowCell {
  if (value == null) return { value: null, text: "—", cls: "c-flat" };
  const dir = value > 0 ? "up" : value < 0 ? "down" : "flat";
  return { value, text: formatInt(value), cls: signClass(dir) };
}

/**
 * Shape the API days into newest-first display rows. The source is left
 * untouched; a defensive copy is sorted descending by date so the latest
 * trading day sits on top regardless of upstream ordering.
 */
export function institutionalToRows(days: readonly InstitutionalDay[]): InstitutionalRow[] {
  return [...days]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((d) => ({
      date: d.date,
      dateLabel: formatTradeDate(d.date),
      foreign: toFlowCell(d.foreignNet),
      trust: toFlowCell(d.trustNet),
      dealer: toFlowCell(d.dealerNet),
      total: toFlowCell(d.totalNet),
    }));
}
