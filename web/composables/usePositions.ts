/**
 * Singleton mock-position book. Module-scoped reactive state shared across
 * every caller. All mutations delegate to the pure, immutable helpers in
 * utils/positions.ts.
 *
 * The book is persisted server-side to {dataDir}/positions.json: on first client
 * use it hydrates from GET /api/positions, and every mutation schedules a
 * debounced PUT so the state survives a reload / app restart. Persistence is
 * best-effort — failures degrade to in-memory-only and never throw into the UI.
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

/** Starting simulated buying power (TWD) when no persisted book exists. */
const INITIAL_CASH = 10_000_000;

/** Coalesce bursts of mutations into a single PUT. */
const PERSIST_DEBOUNCE_MS = 400;

// ── module-scoped reactive state (shared singleton) ──
const positions: Ref<Record<string, Position>> = ref({});
const cashBalance: Ref<number> = ref(INITIAL_CASH);

const totalRealized: ComputedRef<number> = computed(() =>
  computeTotalRealized(positions.value),
);

// ── persistence wiring ──
let loadPromise: Promise<void> | null = null;
let dirty = false; // a local mutation happened (guards stale hydration)
let persistTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Hydrate the book from the server once (client only). If a local mutation has
 * already happened we skip overwriting it, so a slow load can never clobber the
 * user's in-flight changes.
 */
function ensureLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (!import.meta.client) return Promise.resolve();
  const { getPositions } = useApi();
  loadPromise = getPositions()
    .then((book) => {
      if (book && !dirty) {
        positions.value = book.positions;
        cashBalance.value = book.cashBalance;
      }
    })
    .catch((err) => {
      console.error("usePositions: load failed", err);
    });
  return loadPromise;
}

/** Debounced persist of the current book to the server. */
function schedulePersist(): void {
  dirty = true;
  if (!import.meta.client) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const { putPositions } = useApi();
    void putPositions({
      positions: positions.value,
      cashBalance: cashBalance.value,
    });
  }, PERSIST_DEBOUNCE_MS);
}

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
  schedulePersist();
}

/** Flatten a symbol's position at the given price, booking realized P&L. */
function closePosition(symbol: string, price: number): void {
  positions.value = closeAtPrice(positions.value, symbol, price);
  schedulePersist();
}

/**
 * Manually override simulated buying power (TWD) — lets the user set up an
 * arbitrary starting balance for what-if simulations. Non-finite or negative
 * inputs are ignored so a stray/blank edit can never corrupt the book.
 */
function setCashBalance(amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) return;
  cashBalance.value = amount;
  schedulePersist();
}

/** Reset the simulation: clear all positions and restore the starting cash. */
function resetBook(): void {
  positions.value = {};
  cashBalance.value = INITIAL_CASH;
  schedulePersist();
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
  setCashBalance: (amount: number) => void;
  resetBook: () => void;
  ensureLoaded: () => Promise<void>;
  totalUnrealized: (quotes: Record<string, Quote>) => number;
  totalRealized: ComputedRef<number>;
} {
  // Hydrate from the server on first client use (idempotent — guarded by promise).
  if (import.meta.client) void ensureLoaded();
  return {
    positions,
    cashBalance,
    submitOrder,
    canAfford,
    closePosition,
    setCashBalance,
    resetBook,
    ensureLoaded,
    totalUnrealized,
    totalRealized,
  };
}
