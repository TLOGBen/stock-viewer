/**
 * Pure presentation helpers for the 個股頁 health/signal UI. No DOM, no I/O —
 * unit-testable in the plain-node vitest env (mirrors utils/format.ts).
 *
 * 語意鐵律 (紅漲綠跌): bullish = 看漲 = --up (red) = c-up;
 * bearish = 看跌 = --down (green) = c-down; neutral = --flat (grey) = c-flat.
 * `signalClass` is the four-light analogue of `signClass(Direction)` — kept in
 * one place so the lamp colours never drift from the rest of the site.
 */
import type { ResourceStatus, Signal, FaceName } from "~/types";

/** Map a 四燈號 signal to its semantic colour class (same idiom as signClass). */
export function signalClass(s: Signal): string {
  if (s === "bullish") return "c-up";
  if (s === "bearish") return "c-down";
  return "c-flat";
}

/** Chinese label for a health face. */
export function faceLabel(face: FaceName): string {
  switch (face) {
    case "fundamental":
      return "基本面";
    case "chip":
      return "籌碼面";
    case "technical":
      return "技術面";
    case "valuation":
      return "估值面";
    default:
      return face;
  }
}

/** Chinese verdict label for a 四燈號 signal (mirror of domain SIGNAL_LABEL). */
export function signalLabel(s: Signal): string {
  if (s === "bullish") return "偏多";
  if (s === "bearish") return "偏空";
  return "中性";
}

/**
 * The terminal-state copy a StateBlock shows for each non-success status. `n`
 * is the accumulated-period count surfaced in the「歷史累積中」message.
 */
export function stateBlockText(status: ResourceStatus, n?: number | null): string {
  switch (status) {
    case "loading":
      return "載入中…";
    case "accumulating":
      return n != null ? `歷史累積中（${n} 期）` : "歷史累積中";
    case "empty":
      return "無資料";
    case "error":
      return "載入失敗";
    default:
      // idle / success render real content, not a state line.
      return "";
  }
}

/** A StateBlock only paints a state line for the non-content statuses. */
export function isStateLine(status: ResourceStatus): boolean {
  return status !== "idle" && status !== "success";
}

/**
 * Resolve a never-throw fetch result into a ResourceStatus for a single-object
 * resource (e.g. CompanyView, HealthLights). `null` ⇒ the fetch failed or the
 * backend returned nothing (`error`); a present object with `coverage === false`
 * ⇒ `empty` (the source has no data for this symbol); otherwise `success`.
 *
 * `coverage` is optional: objects without the field (e.g. HealthLights) are
 * always `success` when present.
 */
export function resolveObjectStatus<T extends object>(
  result: T | null,
): ResourceStatus {
  if (result == null) return "error";
  if ((result as { coverage?: boolean }).coverage === false) return "empty";
  return "success";
}

/**
 * Resolve a never-throw fetch result into a ResourceStatus for a series-bearing
 * resource (revenue/institutional/margin/valuation). `null` ⇒ `error`; an empty
 * series ⇒ `empty`; a series shorter than `minPeriods` ⇒ `accumulating` (the
 * cold-start window where a quantile/average would be misleading); otherwise
 * `success`. `minPeriods <= 1` disables the accumulating window.
 */
export function resolveSeriesStatus(
  count: number | null,
  ok: boolean,
  minPeriods = 1,
): ResourceStatus {
  if (!ok) return "error";
  if (count == null || count <= 0) return "empty";
  if (count < minPeriods) return "accumulating";
  return "success";
}
