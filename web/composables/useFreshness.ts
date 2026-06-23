/**
 * Data-freshness signal (PQ). Distinguishes a live quote from a stale one
 * (market open but no tick for a while) and from a closed session.
 *
 * Reactivity is backed by ONE module-level wall-clock `now` ref ticked by a
 * single shared setInterval(1000), started lazily on the client. Every caller
 * shares that one timer (no per-call intervals).
 *
 * The classification itself lives in a pure helper, `freshnessOf`, so it can be
 * unit-tested without a Vue runtime.
 */
import { ref, type Ref } from "vue";
import type { MarketStatus, Quote } from "~/types";

export type Freshness = "live" | "stale" | "closed";

/** No tick for longer than this (ms) while the market is open ⇒ stale. */
export const STALE_AFTER_MS = 12_000;

/**
 * Pure freshness classifier. Given a quote's last-update epoch (ms), the current
 * wall-clock epoch (ms), and whether the market session is closed:
 * - closed session            → "closed"
 * - open but no tick > 12s ago → "stale"
 * - otherwise                  → "live"
 *
 * A null/non-finite `quoteUpdatedAt` while open is treated as stale (we have no
 * evidence of a recent tick).
 */
export function freshnessOf(
  quoteUpdatedAt: number | null,
  now: number,
  marketClosed: boolean,
): Freshness {
  if (marketClosed) return "closed";
  if (quoteUpdatedAt === null || !Number.isFinite(quoteUpdatedAt)) return "stale";
  return now - quoteUpdatedAt > STALE_AFTER_MS ? "stale" : "live";
}

// ── shared wall-clock (single timer for the whole app) ──────────────────────

const now: Ref<number> = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

function ensureTimer(): void {
  if (!import.meta.client) return;
  if (timer !== null) return;
  now.value = Date.now();
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
}

export interface UseFreshness {
  /** Wall-clock epoch (ms), updated every second on the client. */
  now: Ref<number>;
  /** Classify a quote against the shared clock and a market status. */
  freshnessOf: (quote: Pick<Quote, "updatedAt"> | null, market: MarketStatus | null) => Freshness;
}

export function useFreshness(): UseFreshness {
  ensureTimer();

  function classify(
    quote: Pick<Quote, "updatedAt"> | null,
    market: MarketStatus | null,
  ): Freshness {
    const marketClosed = market === null ? true : market.session === "closed" || !market.isOpen;
    const updatedAt = quote === null ? null : quote.updatedAt;
    return freshnessOf(updatedAt, now.value, marketClosed);
  }

  return { now, freshnessOf: classify };
}
