import type { PositionBook } from "../domain/index.js";
import { normalizePositionBook } from "../domain/index.js";
import type { PositionBookStore } from "../persistence/index.js";

/**
 * usecase/managePositions — read/replace the persisted mock position book. The
 * action layer only serializes the view; all validation is the pure
 * `normalizePositionBook` boundary, so a hostile/garbage PUT body degrades to a
 * clean book rather than erroring.
 */

/** A position-book view: the book plus when it last changed. */
export interface PositionBookView {
  positions: PositionBook["positions"];
  cashBalance: number;
  updatedAt: number;
}

/** Current book view. */
export function getPositionBook(store: PositionBookStore): PositionBookView {
  const book = store.get();
  return {
    positions: book.positions,
    cashBalance: book.cashBalance,
    updatedAt: store.updatedAtMs(),
  };
}

/** Normalize + persist a raw (client-supplied) book and return its view. */
export async function setPositionBook(
  store: PositionBookStore,
  raw: unknown,
): Promise<PositionBookView> {
  await store.set(normalizePositionBook(raw));
  return getPositionBook(store);
}
