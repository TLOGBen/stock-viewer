/**
 * Pure formatting helpers for the trading desk UI. No Vue, no side effects.
 * 紅漲綠跌: Direction "up" -> red (c-up), "down" -> green (c-down).
 */
import type { Direction } from "~/types";
import { decimalsFor } from "~/utils/tickSize";

/** Thousands-separated integer formatter (en-US grouping). */
const groupFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/** Format a price in TWD. null -> em-dash. Fixed dp, no thousand separators. */
export function formatPrice(n: number | null, dp = 2): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toFixed(dp);
}

/**
 * Format a price with banded precision (PQ-1): decimals follow the TWSE
 * tick-size ladder for the price level, ETF ladder when `isEtf`. null -> em-dash.
 * Unlike `formatPrice` (fixed 2dp, kept for back-compat), this varies decimals so
 * e.g. a 120.5 stock shows 1dp and a 9.85 stock shows 2dp.
 */
export function formatPriceBanded(n: number | null, isEtf = false): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toFixed(decimalsFor(n, isEtf ? "etf" : "stock"));
}

/** Signed change. 0 renders as plain "0.00" (no sign). */
export function formatChange(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return (0).toFixed(dp);
  if (n === 0) return (0).toFixed(dp);
  const sign = n > 0 ? "+" : "-";
  return `${sign}${Math.abs(n).toFixed(dp)}`;
}

/** Signed percent with trailing "%". 0 renders as plain "0.00%". */
export function formatPercent(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return `${(0).toFixed(dp)}%`;
  if (n === 0) return `${(0).toFixed(dp)}%`;
  const sign = n > 0 ? "+" : "-";
  return `${sign}${Math.abs(n).toFixed(dp)}%`;
}

/** Volume in 張, thousands separated. */
export function formatVolume(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return groupFormatter.format(normalizeZero(n));
}

/** Generic integer, thousands separated. */
export function formatInt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return groupFormatter.format(normalizeZero(n));
}

/** Collapse negative-zero and sub-unit negatives to 0 so they never render as "-0". */
function normalizeZero(n: number): number {
  return Math.round(n) === 0 ? 0 : n;
}

/** Pad a number to two digits. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Format an epoch-ms timestamp as "HH:MM:SS" in Taipei time (UTC+8, no DST). */
export function formatTime(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return "--:--:--";
  const TPE_OFFSET_MS = 8 * 60 * 60 * 1000;
  const shifted = new Date(epochMs + TPE_OFFSET_MS);
  const hh = pad2(shifted.getUTCHours());
  const mm = pad2(shifted.getUTCMinutes());
  const ss = pad2(shifted.getUTCSeconds());
  return `${hh}:${mm}:${ss}`;
}

/** Map a direction to its semantic color class. */
export function signClass(d: Direction): string {
  if (d === "up") return "c-up";
  if (d === "down") return "c-down";
  return "c-flat";
}

/** Map a direction to its arrow glyph. */
export function arrow(d: Direction): string {
  if (d === "up") return "▲";
  if (d === "down") return "▼";
  return "—";
}

/** Derive a direction from a signed number. */
export function directionOf(n: number): Direction {
  if (n > 0) return "up";
  if (n < 0) return "down";
  return "flat";
}
