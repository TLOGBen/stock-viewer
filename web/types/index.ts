/**
 * Frontend types. The wire-contract section mirrors server/src/types.ts exactly.
 * The UI-state section is frontend-only.
 */

// ───────────────────────── wire contract (mirror of backend) ─────────────────────────

export interface PriceLevel {
  price: number;
  size: number;
}

export type Direction = "up" | "down" | "flat";

export interface Quote {
  symbol: string;
  exch: string;
  name: string;
  fullName: string;
  price: number | null;
  prevClose: number;
  open: number | null;
  high: number | null;
  low: number | null;
  limitUp: number | null;
  limitDown: number | null;
  volume: number;
  lastVolume: number;
  change: number;
  changePercent: number;
  direction: Direction;
  tick: Direction;
  bids: PriceLevel[];
  asks: PriceLevel[];
  time: string;
  tlong: number;
  updatedAt: number;
}

export type Session = "pre" | "open" | "closed";

export interface MarketStatus {
  isOpen: boolean;
  session: Session;
  serverTime: number;
  label: string;
}

export interface InstrumentMeta {
  symbol: string;
  name: string;
  exch: string;
  type?: SecurityType;
  lotSize?: number; // shares per 張 (default 1000)
  isEtf?: boolean;
  isIndex?: boolean;
}

export interface HistoryPoint {
  t: number;
  price: number;
}

export type ServerMessage =
  | {
      type: "snapshot";
      quotes: Quote[];
      market: MarketStatus;
      history: Record<string, number[]>;
    }
  | { type: "quote"; quote: Quote }
  | { type: "market"; market: MarketStatus }
  | {
      type: "candle";
      symbol: string;
      interval: KlineInterval;
      candle: Candle;
      closed: boolean;
    };

/** Client → server WebSocket messages (mirror of backend ClientMessage). */
export type ClientMessage =
  | { type: "ping" }
  | { type: "view"; symbol: string };

// ───────────────────── wire contract — Phase-0 frozen (mirror of backend) ─────────────────────

export type SecurityType = "stock" | "etf" | "warrant" | "index";

export interface Security {
  symbol: string;
  name: string;
  exch: "tse" | "otc";
  type: SecurityType;
}

export interface UniverseSnapshot {
  asOf: number;
  stale: boolean;
  securities: Security[];
}

/** K-line interval — FROZEN wire form. UI maps display labels (1分/日/週/月) to these. */
export type KlineInterval = "1m" | "5m" | "15m" | "D" | "W" | "M";

/** One OHLCV bar — FROZEN wire shape (klinecharts-native `timestamp`). volume in 張. */
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolStats {
  symbol: string;
  week52High: number | null;
  week52Low: number | null;
  avgVolume20: number | null;
  marketCap: number | null;
  amplitude: number | null;
}

export interface VolumeProfile {
  symbol: string;
  bins: { price: number; volume: number }[];
  poc: number | null;
  valueAreaHigh: number | null;
  valueAreaLow: number | null;
}

export interface HeatmapNode {
  symbol: string;
  name: string;
  weight: number;
  changePercent: number;
}

// ───────────────────────── UI state (frontend-only) ─────────────────────────

export type ConnectionState = "connecting" | "open" | "closed";

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";
export type TimeInForce = "ROD" | "IOC" | "FOK";
export type OrderUnit = "lot" | "share"; // 張 (整股) | 股 (零股)

/** A submitted mock order. New fields optional for back-compat with existing call sites. */
export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  lots: number; // quantity in the chosen unit (張 by default)
  price: number;
  type?: OrderType; // default "limit"
  tif?: TimeInForce; // default "ROD"
  stopPrice?: number; // for stop / stop_limit
  unit?: OrderUnit; // default "lot"
}

/** An open mock position. lots > 0 long, lots < 0 short. avgPrice is the volume-weighted entry. */
export interface Position {
  symbol: string;
  lots: number;
  avgPrice: number;
  realized: number; // realized P&L (TWD) accumulated on this symbol
}

/** A printed trade for the tick tape. */
export interface Tick {
  id: number; // stable monotonic id for transition-group keys
  symbol: string;
  price: number;
  size: number; // 張
  direction: Direction;
  time: string;
}

/** Shares per 張 (board lot) on the Taiwan exchange. */
export const SHARES_PER_LOT = 1000;

// ───────────────────────── chart / UI-only types (Phase 0 freeze) ─────────────────────────

/** Selectable main-chart rendering mode. */
export type KlineChartType =
  | "candle_solid"
  | "candle_stroke" // 空心 K
  | "area"
  | "line"
  | "ohlc"
  | "heikin_ashi";

/** A configured indicator instance on the chart. */
export interface IndicatorSpec {
  name: string; // "MA" | "EMA" | "VOL" | "MACD" | "RSI" | "KDJ" | "BOLL" | ...
  isOverlay: boolean; // true → on the candle pane; false → its own sub-pane
  calcParams?: number[]; // e.g. MA [5,10,20], MACD [12,26,9]
}

/** Async resource state machine (PQ-4) — for surfaces that must not swallow errors. */
export type ResourceStatus = "idle" | "loading" | "success" | "error" | "empty";

export interface AsyncResult<T> {
  status: ResourceStatus;
  data: T | null;
  error: string | null;
}
