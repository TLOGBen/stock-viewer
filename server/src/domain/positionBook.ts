/**
 * Pure types + validation for the persisted mock position book. The book is the
 * frontend's trading state (open positions + buying power) that we now persist
 * to disk so it survives a reload / app restart. No I/O lives here — the disk
 * store is in `persistence/positionBookStore` and the REST glue in
 * `usecase/managePositions`.
 *
 * `normalizePositionBook` is the single trust boundary for BOTH disk reads and
 * PUT request bodies: it never throws, drops malformed positions, and falls back
 * to safe defaults so a corrupt file or hostile body can never crash a caller.
 */

/** A single open mock position. lots > 0 long, lots < 0 short. */
export interface Position {
  symbol: string;
  lots: number;
  avgPrice: number;
  realized: number;
}

/** The persisted book: open positions keyed by symbol + buying power (TWD). */
export interface PositionBook {
  positions: Record<string, Position>;
  cashBalance: number;
}

/** Default starting buying power (TWD) — mirrors the web INITIAL_CASH. */
export const DEFAULT_CASH = 10_000_000;

/** A fresh, empty book at the default starting cash. */
export function emptyBook(): PositionBook {
  return { positions: {}, cashBalance: DEFAULT_CASH };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Validate one raw position; null when any numeric field is missing/malformed. */
function normalizePosition(symbol: string, raw: unknown): Position | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const { lots, avgPrice, realized } = o;
  if (
    !isFiniteNumber(lots) ||
    !isFiniteNumber(avgPrice) ||
    !isFiniteNumber(realized)
  ) {
    return null;
  }
  return { symbol, lots, avgPrice, realized };
}

/**
 * Defensively coerce an arbitrary value into a PositionBook. Unknown/invalid
 * shapes degrade to an empty book; individual malformed positions are dropped;
 * a non-finite or negative cashBalance falls back to the default. Never throws.
 */
export function normalizePositionBook(raw: unknown): PositionBook {
  if (raw == null || typeof raw !== "object") return emptyBook();
  const o = raw as Record<string, unknown>;

  const positions: Record<string, Position> = {};
  const rawPositions = o["positions"];
  if (rawPositions != null && typeof rawPositions === "object") {
    for (const [symbol, value] of Object.entries(
      rawPositions as Record<string, unknown>,
    )) {
      const pos = normalizePosition(symbol, value);
      if (pos != null) positions[symbol] = pos;
    }
  }

  const cash = o["cashBalance"];
  const cashBalance = isFiniteNumber(cash) && cash >= 0 ? cash : DEFAULT_CASH;

  return { positions, cashBalance };
}
