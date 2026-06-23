/**
 * Pure, immutable position-book math for the mock trading blotter. No Vue.
 * lots in 張, shares = lots * SHARES_PER_LOT. lots > 0 long, lots < 0 short.
 */
import type { Position, OrderRequest, Quote } from "~/types";
import { SHARES_PER_LOT } from "~/types";

/** sign helper: +1 / -1 / 0. */
function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/**
 * Apply a mock order to the position book, returning a NEW book.
 * - buy adds +lots, sell adds -lots
 * - adding in the same direction recomputes a volume-weighted avgPrice
 * - reducing/closing/flipping books realized P&L
 */
export function applyOrder(
  positions: Record<string, Position>,
  order: OrderRequest,
): Record<string, Position> {
  // Normalize the order quantity to canonical 張 (lots). A 股 (share) order
  // carries its quantity in shares, so divide by the board lot. Without this,
  // a 股 order would be booked 1000× too large and desync positions vs cash.
  const lots =
    order.unit === "share" ? order.lots / SHARES_PER_LOT : order.lots;
  const delta = order.side === "buy" ? lots : -lots;
  if (delta === 0) return positions;

  const existing: Position | undefined = positions[order.symbol];
  const oldLots = existing?.lots ?? 0;
  const oldAvg = existing?.avgPrice ?? 0;
  const oldRealized = existing?.realized ?? 0;

  let newLots: number;
  let newAvg: number;
  let newRealized = oldRealized;

  if (oldLots === 0 || sign(delta) === sign(oldLots)) {
    // Opening fresh or adding in the same direction -> volume-weighted average.
    newLots = oldLots + delta;
    if (newLots === 0) {
      newAvg = 0;
    } else {
      const totalCost = oldAvg * Math.abs(oldLots) + order.price * Math.abs(delta);
      newAvg = totalCost / Math.abs(newLots);
    }
  } else {
    // Opposite direction: reduce / close / flip.
    const closedLots = Math.min(Math.abs(delta), Math.abs(oldLots));
    const closedShares = closedLots * SHARES_PER_LOT;
    newRealized =
      oldRealized + (order.price - oldAvg) * closedShares * sign(oldLots);

    newLots = oldLots + delta;
    if (newLots === 0) {
      newAvg = 0;
    } else if (sign(newLots) === sign(oldLots)) {
      // Partial reduction -> keep the original average entry price.
      newAvg = oldAvg;
    } else {
      // Flipped past zero -> remainder opens a new position at the fill price.
      newAvg = order.price;
    }
  }

  const updated: Position = {
    symbol: order.symbol,
    lots: newLots,
    avgPrice: newAvg,
    realized: newRealized,
  };

  // Flat with no realized history -> drop the entry entirely.
  if (newLots === 0 && newRealized === 0) {
    const next = { ...positions };
    delete next[order.symbol];
    return next;
  }

  return { ...positions, [order.symbol]: updated };
}

/**
 * Flatten a symbol's position to zero lots at the given price, booking realized.
 * Returns a NEW book. No-op (clone) if the symbol is absent or already flat.
 */
export function closeAtPrice(
  positions: Record<string, Position>,
  symbol: string,
  price: number,
): Record<string, Position> {
  const existing: Position | undefined = positions[symbol];
  if (!existing || existing.lots === 0) return positions;

  const closedShares = Math.abs(existing.lots) * SHARES_PER_LOT;
  const realized =
    existing.realized +
    (price - existing.avgPrice) * closedShares * sign(existing.lots);

  const flattened: Position = {
    symbol,
    lots: 0,
    avgPrice: 0,
    realized,
  };

  if (realized === 0) {
    const next = { ...positions };
    delete next[symbol];
    return next;
  }

  return { ...positions, [symbol]: flattened };
}

/** Unrealized P&L (TWD) for a single position at the given price. */
export function unrealizedPnl(
  position: Position,
  currentPrice: number | null,
): number {
  if (currentPrice === null) return 0;
  return (currentPrice - position.avgPrice) * position.lots * SHARES_PER_LOT;
}

/** Sum of unrealized P&L (TWD) across all positions, priced via quotes. */
export function totalUnrealized(
  positions: Record<string, Position>,
  quotes: Record<string, Quote>,
): number {
  let total = 0;
  for (const symbol of Object.keys(positions)) {
    const position = positions[symbol];
    if (!position) continue;
    const price = quotes[symbol]?.price ?? null;
    total += unrealizedPnl(position, price);
  }
  return total;
}

/** Sum of realized P&L (TWD) across all positions. */
export function totalRealized(positions: Record<string, Position>): number {
  let total = 0;
  for (const symbol of Object.keys(positions)) {
    const position = positions[symbol];
    if (!position) continue;
    total += position.realized;
  }
  return total;
}
