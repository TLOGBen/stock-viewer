/**
 * Canonical wire contract shared between the TWSE backend and the Nuxt frontend.
 * The frontend mirrors these types in web/types/index.ts — keep them in sync.
 */

/** One price/size level in the 五檔 (best-five) order book. size is in 張 (lots). */
export interface PriceLevel {
  price: number;
  size: number;
}

/** Tick direction relative to a reference price. Taiwan convention: up renders RED, down renders GREEN. */
export type Direction = "up" | "down" | "flat";

/** Normalized snapshot of a single instrument, derived from the TWSE MIS getStockInfo payload. */
export interface Quote {
  symbol: string; // "2330"
  exch: string; // "tse" | "otc"
  name: string; // 簡稱 e.g. "台積電"
  fullName: string; // 全名
  price: number | null; // 最新成交價 (z); null until first trade of the session
  prevClose: number; // 昨收 (y)
  open: number | null; // 開盤 (o)
  high: number | null; // 最高 (h)
  low: number | null; // 最低 (l)
  limitUp: number | null; // 漲停價 (u)
  limitDown: number | null; // 跌停價 (w)
  volume: number; // 累計成交量 張 (v)
  lastVolume: number; // 當盤成交量 張 (tv)
  change: number; // price - prevClose (0 when price is null)
  changePercent: number; // change / prevClose * 100
  direction: Direction; // vs prevClose — drives 紅漲綠跌 coloring
  tick: Direction; // vs previously broadcast price — drives flash animation
  bids: PriceLevel[]; // best 5 bids, price descending
  asks: PriceLevel[]; // best 5 asks, price ascending
  time: string; // matching time "09:18:00"
  tlong: number; // exchange timestamp, epoch ms
  updatedAt: number; // server receive time, epoch ms
}

/** Trading-session classification for the Taiwan equity market (09:00–13:30 TPE, Mon–Fri). */
export type Session = "pre" | "open" | "closed";

export interface MarketStatus {
  isOpen: boolean;
  session: Session;
  serverTime: number; // epoch ms
  label: string; // localized: "開盤中" | "盤前" | "休市"
}

/**
 * Static metadata for one instrument. Canonical superset (Phase-0 freeze):
 * a subscribed instrument derived from a universe `Security`, carrying the
 * extra fields the order ticket / heatmap / index band need. Extra fields are
 * optional so existing call sites keep compiling.
 */
export interface InstrumentMeta {
  symbol: string;
  name: string;
  exch: string;
  type?: SecurityType; // stock | etf | warrant | index
  lotSize?: number; // shares per 張 (default 1000 整股)
  isEtf?: boolean;
  isIndex?: boolean; // t00 加權 / o00 櫃買 pseudo-instruments
}

/** A single point in an instrument's rolling intraday price history. */
export interface HistoryPoint {
  t: number; // epoch ms
  price: number;
}

/** Server → client WebSocket messages. */
export type ServerMessage =
  | {
      type: "snapshot";
      quotes: Quote[];
      market: MarketStatus;
      history: Record<string, number[]>; // symbol -> recent price series
    }
  | { type: "quote"; quote: Quote }
  | { type: "market"; market: MarketStatus }
  | {
      // Live K-line update (Phase 3+): a forming or just-closed intraday bar.
      type: "candle";
      symbol: string;
      interval: KlineInterval;
      candle: Candle;
      closed: boolean; // true when the bar's period ended (a new bar starts next)
    };

/** Client → server WebSocket messages. */
export type ClientMessage =
  | { type: "ping" }
  | { type: "view"; symbol: string }; // on-demand subscribe the viewed symbol

// ─────────────────────────── Phase-0 frozen contracts ───────────────────────────

/** Classification of a tradable security in the universe directory. */
export type SecurityType = "stock" | "etf" | "warrant" | "index";

/** One row of the full-market securities universe (上市 TWSE + 上櫃 TPEx + ETF/權證). */
export interface Security {
  symbol: string;
  name: string;
  exch: "tse" | "otc";
  type: SecurityType;
}

/** The cached securities universe with freshness metadata. */
export interface UniverseSnapshot {
  asOf: number; // epoch ms the directory was sourced
  stale: boolean; // true when served from cache after a failed refresh
  securities: Security[];
}

/** K-line interval token. FROZEN wire form — UI maps display labels to these. */
export type KlineInterval = "1m" | "5m" | "15m" | "D" | "W" | "M";

/** One OHLCV bar. FROZEN wire shape (klinecharts-native `timestamp`). volume in 張. */
export interface Candle {
  timestamp: number; // epoch ms of the bar's open
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // 張 (lots)
}

/** 52-week / average-volume / market-cap statistics for one symbol (QM-2). */
export interface SymbolStats {
  symbol: string;
  week52High: number | null;
  week52Low: number | null;
  avgVolume20: number | null; // 20-day average, 張
  marketCap: number | null; // TWD
  amplitude: number | null; // (high-low)/prevClose * 100
}

/** Volume-at-price distribution for one symbol/session (CT-8). */
export interface VolumeProfile {
  symbol: string;
  bins: { price: number; volume: number }[];
  poc: number | null; // point of control (max-volume price)
  valueAreaHigh: number | null;
  valueAreaLow: number | null;
}

/** One cell of the market heatmap treemap (QM-10). */
export interface HeatmapNode {
  symbol: string;
  name: string;
  weight: number; // size metric: turnover or market cap
  changePercent: number; // color metric (紅漲綠跌)
}
