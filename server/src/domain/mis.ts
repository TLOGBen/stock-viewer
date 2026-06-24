/**
 * Pure MIS (getStockInfo) payload parsers. No I/O — normalizes raw MIS items
 * into the canonical wire `Quote` shape. Extracted from the feed orchestrator so
 * the parsing arithmetic is unit-testable in isolation.
 */
import type {
  Quote,
  Direction,
  PriceLevel,
  InstrumentMeta,
} from "./types.js";

/** "tse_2330.tw|tse_2317.tw" — the batched ex_ch query value. */
export function buildExCh(instruments: InstrumentMeta[]): string {
  return instruments.map((i) => `${i.exch}_${i.symbol}.tw`).join("|");
}

/** Split `items` into chunks of at most `size` (size coerced to >= 1). */
export function chunk<T>(items: T[], size: number): T[][] {
  const n = Number.isFinite(size) && size >= 1 ? Math.trunc(size) : 1;
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) {
    out.push(items.slice(i, i + n));
  }
  return out;
}

/** Parse a MIS numeric field, treating "-"/empty/missing/NaN as null. */
export function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed === "" || trimmed === "-") return null;
  const n = Number.parseFloat(trimmed);
  return Number.isNaN(n) ? null : n;
}

/** Read a MIS field as a string ("" when missing/non-string). */
function strOf(item: Record<string, unknown>, key: string): string {
  const v = item[key];
  return typeof v === "string" ? v : "";
}

/** Parse an integer MIS field, defaulting to 0 when missing/invalid. */
function intOrZero(v: unknown): number {
  const n = numOrNull(v);
  return n == null ? 0 : Math.trunc(n);
}

/**
 * Zip "_"-separated price/size strings into levels: drop empty tokens (incl. the
 * trailing one MIS appends), then cap to the shorter list.
 */
export function parseLevels(
  priceStr: string | undefined,
  sizeStr: string | undefined,
): PriceLevel[] {
  const prices = (priceStr ?? "")
    .split("_")
    .filter((s) => s !== "")
    .map((s) => Number.parseFloat(s));
  const sizes = (sizeStr ?? "")
    .split("_")
    .filter((s) => s !== "")
    .map((s) => Number.parseInt(s, 10));
  const len = Math.min(prices.length, sizes.length);
  const levels: PriceLevel[] = [];
  for (let i = 0; i < len; i++) {
    const price = prices[i];
    const size = sizes[i];
    // Drop non-finite tokens: Number.parseFloat("-")/"abc" yields NaN, which the
    // null-only guard would miss and poison bestBid/bestAsk and the price chain.
    if (
      price == null ||
      size == null ||
      !Number.isFinite(price) ||
      !Number.isFinite(size)
    )
      continue;
    levels.push({ price, size });
  }
  return levels;
}

/** First finite value in a list, else null (NaN is treated like null). */
function firstNonNull(...values: (number | null)[]): number | null {
  for (const v of values) {
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

/** Direction of `price` relative to a reference (null price → "flat"). */
function directionVs(price: number | null, ref: number | null): Direction {
  if (price == null || ref == null) return "flat";
  if (price > ref) return "up";
  if (price < ref) return "down";
  return "flat";
}

/**
 * Build a normalized Quote from a raw MIS item. Price resolution chain (z is
 * often "-" mid-session): z → pz → prevPrice (carried) → midpoint → o → y.
 */
export function parseMisItem(
  item: Record<string, unknown>,
  meta: InstrumentMeta | undefined,
  prevPrice: number | null,
  now: number,
): Quote {
  const symbol = strOf(item, "c");
  const asks = parseLevels(strOf(item, "a"), strOf(item, "f"));
  const bids = parseLevels(strOf(item, "b"), strOf(item, "g"));

  const bestBid = bids.length > 0 ? bids[0]!.price : null;
  const bestAsk = asks.length > 0 ? asks[0]!.price : null;
  const midpoint =
    bestBid != null &&
    bestAsk != null &&
    Number.isFinite(bestBid) &&
    Number.isFinite(bestAsk)
      ? (bestBid + bestAsk) / 2
      : null;

  const open = numOrNull(item["o"]);
  const prevCloseRaw = numOrNull(item["y"]);
  const prevClose = prevCloseRaw ?? 0;

  const price = firstNonNull(
    numOrNull(item["z"]),
    numOrNull(item["pz"]),
    prevPrice,
    midpoint,
    open,
    prevCloseRaw,
  );

  const change = price == null ? 0 : price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;

  return {
    symbol,
    exch: strOf(item, "ex") || meta?.exch || "tse",
    name: strOf(item, "n") || meta?.name || symbol,
    fullName: strOf(item, "nf"),
    price,
    prevClose,
    open,
    high: numOrNull(item["h"]),
    low: numOrNull(item["l"]),
    limitUp: numOrNull(item["u"]),
    limitDown: numOrNull(item["w"]),
    volume: intOrZero(item["v"]),
    lastVolume: intOrZero(item["tv"]),
    change,
    changePercent,
    direction: directionVs(price, prevClose),
    tick: directionVs(price, prevPrice),
    bids,
    asks,
    time: strOf(item, "t"),
    tlong: intOrZero(item["tlong"]),
    updatedAt: now,
  };
}

/** Normalize a getStockInfo response into Quote[]; tolerates missing msgArray, skips symbol-less items. */
export function parseMisResponse(
  json: unknown,
  metaBySymbol: Map<string, InstrumentMeta>,
  prevPrices: Map<string, number | null>,
  now: number,
): Quote[] {
  const root = (json ?? {}) as Record<string, unknown>;
  const rawArray = root["msgArray"];
  const items = Array.isArray(rawArray) ? rawArray : [];
  const quotes: Quote[] = [];
  for (const raw of items) {
    if (raw == null || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const symbol = strOf(item, "c");
    if (symbol === "") continue;
    const prevPrice = prevPrices.get(symbol) ?? null;
    quotes.push(parseMisItem(item, metaBySymbol.get(symbol), prevPrice, now));
  }
  return quotes;
}
