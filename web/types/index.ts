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

/**
 * Where a Quote's numbers came from (mirror of backend `QuoteSource`):
 *  - "mis"            — live MIS real-time tick (the primary source)
 *  - "official-close" — official TWSE OpenAPI daily close, used as a fallback
 *                       floor when the MIS feed is failing. Absent ⇒ "mis".
 */
export type QuoteSource = "mis" | "official-close";

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
  source?: QuoteSource; // provenance; absent ⇒ live MIS tick
}

/** Live-feed health snapshot, surfaced by `/api/health` (mirror of backend). */
export interface FeedHealth {
  consecutiveFailures: number; // failed polls in a row (0 = healthy)
  lastTickAt: number; // epoch ms of the last successful MIS poll (0 = never)
  lastTickAgeMs: number | null; // age of that tick, or null when never
  lastError: string | null; // last poll error message, if any
  fallbackActive: boolean; // true while serving official-close fallback
  activeSymbols: number; // size of the active poll set
  snapshotCount: number; // symbols with a current snapshot
  officialCache: {
    size: number; // rows in the official-close cache
    ageMs: number | null; // age of cached official data, or null when never
  };
}

/** Overall system health, surfaced by `/api/health` (mirror of backend). */
export interface HealthReport {
  status: "ok" | "degraded" | "down"; // rolled-up traffic light
  uptimeMs: number;
  serverTime: number; // epoch ms
  version: string;
  market: MarketStatus;
  feed: FeedHealth;
  universe: { count: number; stale: boolean; asOf: number };
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

// ───────────────────── wire contract — 個股頁 (mirror of backend usecase views) ─────────────────────
//
// These mirror the JSON returned by the eight read-only /api/{company,revenue,
// financials,dividends,institutional,margin,valuation,health-lights}/:symbol
// routes. Field names and units track server/src/domain/* and the usecase view
// types exactly (do NOT re-scale — units are encoded in the field names).

/** 個股「公司基本資料」(mirror of domain CompanyProfile). */
export interface CompanyProfile {
  symbol: string;
  shortName: string;
  chairman: string;
  ceo: string;
  /** Raw 產業別 code (e.g. "05"). */
  industryCode: string;
  taxId: string;
  /** As reported, "YYYYMMDD" (e.g. "19560501"). */
  foundDate: string;
  listDate: string;
  website: string;
  transferAgent: string;
}

/** GET /api/company/:symbol envelope. */
export interface CompanyView {
  symbol: string;
  coverage: boolean;
  profile: CompanyProfile | null;
  /** 產業別 code → Chinese name (empty when no profile). */
  industryName: string;
}

/** One month of revenue (mirror of domain MonthlyRevenue). 當月營收 unit = 千元. */
export interface MonthlyRevenue {
  /** Gregorian year-month, "YYYY-MM". */
  yearMonth: string;
  /** 當月營收, 千元. null when blank/"-". */
  revenueThousands: number | null;
  /** 上月比較增減 %, already a percentage. */
  momPct: number | null;
  /** 去年同月增減 %. */
  yoyPct: number | null;
  /** 今年累計較去年同期增減 %. */
  accYoyPct: number | null;
}

/** GET /api/revenue/:symbol envelope. */
export interface RevenueView {
  symbol: string;
  coverage: boolean;
  series: MonthlyRevenue[];
}

/** Which t187ap06_L_* income-statement sheet a row came from. */
export type FinancialVariant = "ci" | "basi" | "mim" | "fh" | "ins";

/** One quarter of income-statement figures (mirror of domain). Amounts in 仟元. */
export interface FinancialStatement {
  /** Gregorian year + quarter, "YYYYQn". */
  period: string;
  /** 營業收入, 仟元. */
  revenue: number | null;
  /** 營業毛利, 仟元. */
  grossProfit: number | null;
  /** 營業利益, 仟元. */
  operatingIncome: number | null;
  /** 本期淨利, 仟元. */
  netIncome: number | null;
  /** 基本每股盈餘, 元/share. */
  eps: number | null;
  variant: FinancialVariant;
}

/** One quarter of balance-sheet figures (mirror of domain). Amounts in 千元. */
export interface BalanceSheet {
  period: string;
  /** 資產總額, 千元. */
  totalAssets: number | null;
  /** 負債總額, 千元. */
  totalLiab: number | null;
  /** 權益總額, 千元. */
  totalEquity: number | null;
  /** 每股參考淨值, NT$ per share (not 千元). */
  bvps: number | null;
}

/** GET /api/financials/:symbol envelope. */
export interface FinancialsView {
  symbol: string;
  coverage: boolean;
  variant: FinancialVariant | null;
  statement: FinancialStatement | null;
  balance: BalanceSheet | null;
  /** 負債總額 / 資產總額 (fraction; ×100 for %). null when unknown. */
  debtRatio: number | null;
  /** 稅後淨利 / 權益總額 (fraction; ×100 for %). null when unknown. */
  roe: number | null;
}

/** One year/期 of dividend (mirror of domain Dividend). 元/股. */
export interface Dividend {
  /** 股利年度 as reported, ROC year string (a label). */
  year: string;
  /** 期別 (kept raw; combines with year as the key). */
  period: string;
  /** 現金股利, 元/股. null when all cash columns blank. */
  cashDividend: number | null;
  /** 股票股利 (配股), 元/股. */
  stockDividend: number | null;
  /** 董事會（擬議）股利分派日, ROC packed "YYYMMDD". */
  resolutionDate: string;
}

/** Most recent ex-dividend event (mirror of domain ExDividend). */
export interface ExDividend {
  /** 除權息交易日, epoch ms; NaN when unparseable. */
  date: number;
  /** 除權息前收盤價, 元. */
  refPriceBefore: number | null;
  /** 除權息參考價, 元. */
  refPrice: number | null;
  /** 權值+息值, 元. */
  value: number | null;
  /** 除權 → "權", 除息 → "息"; null otherwise. */
  kind: "權" | "息" | null;
}

/** GET /api/dividends/:symbol envelope. */
export interface DividendsView {
  symbol: string;
  coverage: boolean;
  series: Dividend[];
  /** Latest ex-date observed in the by-date window (N2), or null. */
  exDividend: ExDividend | null;
}

/** Three-investor daily net flow (mirror of domain InstitutionalFlow). Unit = 張. */
export interface InstitutionalFlow {
  /** 外資, 張. */
  foreignNet: number | null;
  /** 投信, 張. */
  trustNet: number | null;
  /** 自營商, 張. */
  dealerNet: number | null;
  /** 三大法人合計, 張. */
  totalNet: number | null;
}

/** One trading day of institutional flow. */
export interface InstitutionalDay extends InstitutionalFlow {
  /** Trading day, "YYYYMMDD". */
  date: string;
}

/** GET /api/institutional/:symbol envelope. */
export interface InstitutionalView {
  symbol: string;
  coverage: boolean;
  days: InstitutionalDay[];
}

/** One official material announcement (mirror of domain Disclosure). No view counts. */
export interface Disclosure {
  symbol: string;
  /** 發言日期, raw ROC packed "1150624". */
  dateRoc: string;
  /** epoch ms of 發言日期; NaN when unparseable. */
  date: number;
  /** 發言時間, raw "64502". */
  time: string;
  /** 主旨 (title). */
  subject: string;
  /** 事實發生日, raw ROC packed. */
  factDateRoc: string;
}

/** GET /api/disclosures/:symbol envelope (個股重大訊息). */
export interface DisclosuresView {
  symbol: string;
  coverage: boolean;
  items: Disclosure[];
}

/** Margin / short balance (mirror of domain MarginData). Unit = 張 (NOT /1000). */
export interface MarginData {
  /** 融資今日餘額, 張. */
  marginBalance: number | null;
  /** 融券今日餘額, 張. */
  shortBalance: number | null;
  /** 券資比 % = 融券餘額 / 融資餘額 × 100. */
  shortMarginRatioPct: number | null;
}

/** One trading day of margin data. */
export interface MarginDay extends MarginData {
  /** Trading day, "YYYYMMDD". */
  date: string;
}

/** GET /api/margin/:symbol envelope. */
export interface MarginView {
  symbol: string;
  coverage: boolean;
  days: MarginDay[];
}

/** One PE/PB point in the valuation series (mirror of usecase ValuationDay). */
export interface ValuationPoint {
  /** Raw ROC packed date as reported by BWIBBU (e.g. "1150624"). */
  date: string;
  pe: number | null;
  pb: number | null;
}

/** Quantile band over a ratio series + current placement (mirror of domain). */
export interface ValuationBand {
  count: number;
  min: number;
  max: number;
  p20: number;
  p40: number;
  p60: number;
  p80: number;
  current: number | null;
  /** 現價落點: cheap (≤p20) / fair / expensive (≥p80); null when no current. */
  zone: "cheap" | "fair" | "expensive" | null;
}

/** GET /api/valuation/:symbol envelope. */
export interface ValuationView {
  symbol: string;
  coverage: boolean;
  /** Accumulated PE/PB points, newest-first. */
  series: ValuationPoint[];
  /** Quantile band over real PE history; null on cold-start. */
  pe: ValuationBand | null;
  /** Quantile band over real PB history; null on cold-start. */
  pb: ValuationBand | null;
}

/** 四燈號 signal direction (mirror of domain Signal). */
export type Signal = "bullish" | "neutral" | "bearish";

/** One of the four health faces (mirror of domain FaceName). */
export type FaceName = "fundamental" | "chip" | "technical" | "valuation";

/** 單一面向燈號 (mirror of domain FaceLight). score 0-25. */
export interface FaceLight {
  face: FaceName;
  signal: Signal;
  /** 0-25 (neutral = 12.5). */
  score: number;
  coverage: boolean;
  reasons: string[];
}

/** GET /api/health-lights/:symbol envelope (mirror of domain HealthLights). */
export interface HealthLights {
  symbol: string;
  overall: {
    /** 0-100. */
    score: number;
    signal: Signal;
  };
  faces: FaceLight[];
  headline: string;
  /** 資料截止時間 (epoch ms); 0 when no data. */
  asOf: number;
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

/** The persisted mock book: open positions keyed by symbol + buying power (TWD). */
export interface PositionBook {
  positions: Record<string, Position>;
  cashBalance: number;
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

/**
 * Async resource state machine (PQ-4) — for surfaces that must not swallow errors.
 * `accumulating` is a cold-start state: the by-date/series source has fewer than
 * the minimum points needed to be meaningful, so the UI shows「歷史累積中」rather
 * than a fake historical average (REQ-005/008/010/014).
 */
export type ResourceStatus =
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "empty"
  | "accumulating";

export interface AsyncResult<T> {
  status: ResourceStatus;
  data: T | null;
  error: string | null;
}
