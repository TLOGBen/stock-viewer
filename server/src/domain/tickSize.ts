/**
 * 台股價格分級表 (TWSE tick-size ladder) — single source of truth (PQ-1).
 * Pure, no deps. Mirrored verbatim at web/utils/tickSize.ts — keep in sync.
 *
 * Returns the legal price increment (step) and its natural decimal places for a
 * given price. `kind` distinguishes 整股 (stock) from ETF, whose ladder differs.
 */

export interface TickInfo {
  step: number;
  decimals: number;
}

export type TickKind = "stock" | "etf";

interface Band {
  below: number; // applies while price < below
  step: number;
  decimals: number;
}

const STOCK_BANDS: Band[] = [
  { below: 10, step: 0.01, decimals: 2 },
  { below: 50, step: 0.05, decimals: 2 },
  { below: 100, step: 0.1, decimals: 1 },
  { below: 500, step: 0.5, decimals: 1 },
  { below: 1000, step: 1, decimals: 0 },
  { below: Infinity, step: 5, decimals: 0 },
];

const ETF_BANDS: Band[] = [
  { below: 50, step: 0.01, decimals: 2 },
  { below: Infinity, step: 0.05, decimals: 2 },
];

/** Tick step + decimals for `price` under the stock or ETF ladder. */
export function tickSizeFor(price: number, kind: TickKind = "stock"): TickInfo {
  const bands = kind === "etf" ? ETF_BANDS : STOCK_BANDS;
  const p = Number.isFinite(price) ? Math.abs(price) : 0;
  for (const b of bands) {
    if (p < b.below) return { step: b.step, decimals: b.decimals };
  }
  const last = bands[bands.length - 1]!;
  return { step: last.step, decimals: last.decimals };
}

/** Natural display decimals for `price` under the ladder. */
export function decimalsFor(price: number, kind: TickKind = "stock"): number {
  return tickSizeFor(price, kind).decimals;
}

/** Snap `price` to a legal tick. side: nearest (default) / up / down. */
export function roundToTick(
  price: number,
  kind: TickKind = "stock",
  side: "nearest" | "up" | "down" = "nearest",
): number {
  if (!Number.isFinite(price)) return price;
  const { step, decimals } = tickSizeFor(price, kind);
  const n = price / step;
  const k =
    side === "up" ? Math.ceil(n) : side === "down" ? Math.floor(n) : Math.round(n);
  return Number((k * step).toFixed(decimals));
}
