/**
 * Singleton mock-position book. Module-scoped reactive state shared across
 * every caller. All mutations delegate to the pure, immutable helpers in
 * utils/positions.ts.
 */
import { ref, computed, type Ref, type ComputedRef } from "vue";
import type { Position, OrderRequest, OrderSide, Quote } from "~/types";
import type { FeeBreakdown } from "../utils/fees";
import {
  applyOrder,
  closeAtPrice,
  totalUnrealized as computeTotalUnrealized,
  totalRealized as computeTotalRealized,
} from "../utils/positions";

/** Starting simulated buying power (TWD). Session-only; resets on reload. */
const INITIAL_CASH = 10_000_000;

// ── module-scoped reactive state (shared singleton) ──
const positions: Ref<Record<string, Position>> = ref({});
const cashBalance: Ref<number> = ref(INITIAL_CASH);

const totalRealized: ComputedRef<number> = computed(() =>
  computeTotalRealized(positions.value),
);

/**
 * Whether the order leg is affordable given current cash. Buys require the
 * fee-inclusive net (cash out) to fit within the balance; sells always pass
 * (they credit cash). A null/missing breakdown is treated as affordable so
 * callers without fee context keep their prior behaviour.
 */
function canAfford(fee: FeeBreakdown | null, side: OrderSide): boolean {
  if (side === "sell") return true;
  if (!fee) return true;
  return fee.net <= cashBalance.value;
}

/**
 * Submit a mock order, folding it into the book immutably. When a fee
 * breakdown is supplied, cash is debited (buy) / credited (sell) by its net,
 * keeping buying power in sync. Without a breakdown, only the position book
 * moves — preserving the original behaviour for existing callers.
 */
function submitOrder(order: OrderRequest, fee?: FeeBreakdown): void {
  positions.value = applyOrder(positions.value, order);
  if (fee) {
    cashBalance.value =
      order.side === "buy"
        ? cashBalance.value - fee.net
        : cashBalance.value + fee.net;
  }
}

/** Flatten a symbol's position at the given price, booking realized P&L. */
function closePosition(symbol: string, price: number): void {
  positions.value = closeAtPrice(positions.value, symbol, price);
}

/** Sum of unrealized P&L (TWD) across the book, priced via live quotes. */
function totalUnrealized(quotes: Record<string, Quote>): number {
  return computeTotalUnrealized(positions.value, quotes);
}

export function usePositions(): {
  positions: Ref<Record<string, Position>>;
  cashBalance: Ref<number>;
  submitOrder: (o: OrderRequest, fee?: FeeBreakdown) => void;
  canAfford: (fee: FeeBreakdown | null, side: OrderSide) => boolean;
  closePosition: (symbol: string, price: number) => void;
  totalUnrealized: (quotes: Record<string, Quote>) => number;
  totalRealized: ComputedRef<number>;
} {
  return {
    positions,
    cashBalance,
    submitOrder,
    canAfford,
    closePosition,
    totalUnrealized,
    totalRealized,
  };
}
