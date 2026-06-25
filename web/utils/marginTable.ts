/**
 * Pure presentational transforms for MarginTable.vue (融資融券).
 *
 * Keeps the .vue lean and unit-testable. All functions are pure and immutable —
 * they never mutate their inputs and never touch IO.
 *
 * Unit 量綱: 融資/融券 餘額 are 張 (lots), already in 張 upstream — the domain
 * parseMarginRow does NOT divide by 1000 (MI_MARGN balances are already 張).
 * We only format, never re-scale. 券資比% (shortMarginRatioPct) is already a
 * percentage value (融券餘額 / 融資餘額 × 100), rendered with a trailing "%".
 *
 * Balances carry no 漲跌 semantic (they are stock levels, not gains/losses) so
 * they render as plain mono integers — no 紅漲綠跌 colouring. 「—」on null.
 */
import type { MarginDay } from "~/types";
import { formatInt } from "~/utils/format";

/** A fully shaped margin row: pretty date + formatted balances + ratio. */
export interface MarginRow {
  /** Original "YYYYMMDD" key (stable v-for key). */
  readonly date: string;
  /** Display date "YYYY-MM-DD"; passes through unrecognised input untouched. */
  readonly dateLabel: string;
  /** 融資餘額, 張 — thousands-separated, or「—」when null. */
  readonly marginBalanceText: string;
  /** 融券餘額, 張 — thousands-separated, or「—」when null. */
  readonly shortBalanceText: string;
  /** 券資比 %, one decimal + "%", or「—」when null. */
  readonly shortMarginRatioText: string;
}

/** Format an "YYYYMMDD" key as "YYYY-MM-DD"; non-8-digit input passes through.
 *  Module-private: the exported canonical copy lives in utils/institutionalTable
 *  (kept unique to avoid Nuxt auto-import name collisions). */
function formatTradeDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** Format a 張 balance: thousands-separated integer, or「—」when null. */
export function formatLots(value: number | null): string {
  return value == null ? "—" : formatInt(value);
}

/** Format 券資比%: one decimal + trailing "%", or「—」when null.
 *  Module-private (note: distinct from financialsTransform.formatRatioPct, which
 *  renders 2 decimals) — kept private so the two never collide in auto-import. */
function formatRatioPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

/**
 * Shape the API days into newest-first display rows. The source is left
 * untouched; a defensive copy is sorted descending by date so the latest
 * trading day sits on top regardless of upstream ordering.
 */
export function marginToRows(days: readonly MarginDay[]): MarginRow[] {
  return [...days]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((d) => ({
      date: d.date,
      dateLabel: formatTradeDate(d.date),
      marginBalanceText: formatLots(d.marginBalance),
      shortBalanceText: formatLots(d.shortBalance),
      shortMarginRatioText: formatRatioPct(d.shortMarginRatioPct),
    }));
}
