/**
 * Pure official daily-close (`STOCK_DAY_ALL`) → `Quote` conversion. No I/O — the
 * disk/network cache (`OfficialCloseCache`) lives in persistence/adapters and
 * calls into this parser.
 */
import type { InstrumentMeta, Quote } from "./types.js";

/** Shape of one `STOCK_DAY_ALL` row we care about (all fields are strings). */
export interface StockDayAllRow {
  Code?: string;
  Name?: string;
  OpeningPrice?: string;
  HighestPrice?: string;
  LowestPrice?: string;
  ClosingPrice?: string;
  Change?: string;
  TradeVolume?: string;
}

/** Default shares per 張 (整股) when an instrument carries no lotSize. */
const DEFAULT_LOT_SIZE = 1000;

/** Parse a numeric string field; "-"/""/missing/NaN → null. */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/,/g, "");
  if (t === "" || t === "-") return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build a degraded fallback `Quote` from one official daily-close row. Pure and
 * testable. Returns null when the row has no usable closing price (e.g. a stock
 * that did not trade), so callers can skip it rather than emit a price-less
 * fallback. `prevClose = ClosingPrice − Change`; volume is shares → 張.
 */
export function parseStockDayAllRow(
  row: StockDayAllRow,
  meta: InstrumentMeta,
  now: number,
): Quote | null {
  const close = num(row.ClosingPrice);
  if (close == null) return null;

  const change = num(row.Change) ?? 0;
  const prevClose = close - change;
  const lotSize = meta.lotSize ?? DEFAULT_LOT_SIZE;
  const volumeShares = num(row.TradeVolume) ?? 0;
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";

  return {
    symbol: meta.symbol,
    exch: meta.exch,
    name: meta.name,
    fullName: meta.name,
    price: close,
    prevClose,
    open: num(row.OpeningPrice),
    high: num(row.HighestPrice),
    low: num(row.LowestPrice),
    limitUp: null,
    limitDown: null,
    volume: Math.round(volumeShares / lotSize),
    lastVolume: 0,
    change,
    changePercent: prevClose !== 0 ? (change / prevClose) * 100 : 0,
    direction,
    tick: "flat",
    bids: [],
    asks: [],
    time: "收盤",
    tlong: 0,
    updatedAt: now,
    source: "official-close",
  };
}
