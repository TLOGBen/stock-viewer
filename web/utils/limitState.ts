/**
 * Limit-up / limit-down lock detection (PQ). Pure, no deps.
 *
 * A Taiwan equity is "locked" at the daily price limit when the last price has
 * reached (or effectively reached, within a tiny tick fraction) the published
 * 漲停 / 跌停 ceiling/floor. We use a small absolute epsilon so that a price
 * landing exactly on, or a hair below/above due to float rounding, still counts.
 */
import type { Quote } from "~/types";

export type LimitState = "lock-up" | "lock-down" | null;

/** Tiny tolerance (smaller than the finest TWSE tick, 0.01) for float wobble. */
const EPSILON = 1e-4;

/**
 * Returns "lock-up" when price has reached limitUp, "lock-down" when it has
 * reached limitDown, otherwise null. Null is also returned when price or the
 * relevant limit is missing/non-finite.
 */
export function limitStateOf(quote: Pick<Quote, "price" | "limitUp" | "limitDown">): LimitState {
  const { price, limitUp, limitDown } = quote;
  if (price === null || !Number.isFinite(price)) return null;

  if (limitUp !== null && Number.isFinite(limitUp) && price >= limitUp - EPSILON) {
    return "lock-up";
  }
  if (limitDown !== null && Number.isFinite(limitDown) && price <= limitDown + EPSILON) {
    return "lock-down";
  }
  return null;
}
