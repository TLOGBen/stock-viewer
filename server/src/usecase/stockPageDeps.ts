import type {
  BulkByDateCache,
  SnapshotSeriesCache,
  HistoryCache,
} from "../persistence/index.js";
import type {
  CompanyProfile,
  MonthlyRevenue,
  FinancialStatement,
  FinancialVariant,
  BalanceSheet,
  Dividend,
  InstitutionalFlow,
  MarginData,
  ValuationPoint,
  ExDividend,
  Disclosure,
} from "../domain/index.js";
import type { UniverseProvider } from "./universeService.js";

/**
 * usecase/stockPageDeps — the injected dependency surface for the 個股頁
 * (stock-page) usecases (getCompany / getRevenue / getFinancials / getDividends
 * / getInstitutional / getMargin / getValuation / getHealthLights).
 *
 * Every member is a persistence cache or the universe provider — never an
 * adapter. The composition root (`index.ts buildStockPageDeps()`) wires the
 * adapter+domain-parser pairs into each cache's injected fetcher, so these
 * usecases compose pure domain functions over cache reads and never reach the
 * network or the framework directly. All caches are `never throw`, so the
 * usecases degrade to `coverage:false` / empty rather than failing a page.
 *
 * Each usecase declares a NARROW sub-deps interface (a structural subset of
 * `StockPageDeps`) so a test injects only the caches it exercises.
 */

// ── cache A: per-source, by-date whole-market accumulation (keyed by code) ──

/** 三大法人買賣超 by-date cache (T86 → InstitutionalFlow per code). */
export type InstitutionalCache = BulkByDateCache<InstitutionalFlow>;
/** 融資融券 by-date cache (MI_MARGN → MarginData per code). */
export type MarginCache = BulkByDateCache<MarginData>;
/** 估值 by-date cache (BWIBBU_ALL → ValuationPoint per code). */
export type ValuationCache = BulkByDateCache<ValuationPoint>;
/** 除權息 by-date cache (TWT49U → ExDividend per code). */
export type ExRightCache = BulkByDateCache<ExDividend>;
/** 重大訊息 by-date cache (t187ap04_L → the day's Disclosure[] per code). */
export type DisclosureCache = BulkByDateCache<Disclosure[]>;

// ── cache B: per-symbol, append-over-time series ──

/** 月營收 per-symbol series cache (ap05 → MonthlyRevenue). */
export type RevenueCache = SnapshotSeriesCache<MonthlyRevenue>;

/**
 * 估值 per-symbol series cache (PE/PB/殖利率 → ValuationPoint), keyed by date.
 * Mirrors RevenueCache (cache B): the build-time FinMind seed and the runtime
 * continuation both fold per-day ValuationPoints into this series, so getValuation
 * and getHealthLights.valuationFace read ONE per-symbol source — not the
 * whole-market by-date cache. Replaces the 60-day by-date reconstruction with a
 * long (multi-year) river-chart history.
 */
export type ValuationSeriesCache = SnapshotSeriesCache<ValuationPoint>;

/**
 * 損益表 per-variant fetcher. Given a symbol and a candidate financial variant,
 * returns the latest FinancialStatement for that variant or null when the symbol
 * is absent from that variant's snapshot. The composition root wires this over
 * fundamentalsClient + parseFinStatementRow; the usecase uses null/non-null as
 * the membership-lookup signal that resolves the _basi/_mim/_fh/_ins sub-variant.
 */
export type FinancialsByVariantFetcher = (
  symbol: string,
  variant: FinancialVariant,
) => Promise<FinancialStatement | null>;

/**
 * 資產負債表 fetcher. Given a symbol and the already-resolved variant, returns
 * the latest BalanceSheet (same 公司代號+年度+季別 join key as the income
 * statement) or null when absent.
 */
export type BalanceByVariantFetcher = (
  symbol: string,
  variant: FinancialVariant,
) => Promise<BalanceSheet | null>;

/** 公司基本資料 fetcher (ap03 → CompanyProfile, or null when symbol absent). */
export type CompanyFetcher = (symbol: string) => Promise<CompanyProfile | null>;

/** 股利分派 fetcher (ap45 → the symbol's Dividend series, newest-last). */
export type DividendSeriesFetcher = (symbol: string) => Promise<Dividend[]>;

/**
 * Full injected dependency surface for the stock-page usecases. Held inside the
 * optional `stockPageDeps` sub-object of ApiDeps so the existing 6-field ApiDeps
 * contract is untouched (REQ-014).
 */
export interface StockPageDeps {
  provider: UniverseProvider;
  company: CompanyFetcher;
  revenue: RevenueCache;
  financials: FinancialsByVariantFetcher;
  balance: BalanceByVariantFetcher;
  dividends: DividendSeriesFetcher;
  institutional: InstitutionalCache;
  margin: MarginCache;
  valuation: ValuationCache;
  /** Per-symbol PE/PB series (cache B); getValuation reads its long history. */
  valuationSeries: ValuationSeriesCache;
  exRight: ExRightCache;
  disclosures: DisclosureCache;
  /** Daily K-line cache reused for the technical face + 河流圖 current price. */
  history: HistoryCache;
}

/** How many recent trading days the by-date usecases sweep by default. */
export const DEFAULT_RECENT_DAYS = 5;

/**
 * How many recent trading days the 估值河流圖 accumulates before drawing bands.
 * A wider window than the chip lookback so the quantile band is meaningful as it
 * fills in; cold-start short windows still draw (with fewer points) and the UI
 * shows the「累積中」state.
 */
export const VALUATION_WINDOW_DAYS = 60;

/**
 * Max retained daily PE/PB points in the per-symbol valuation series (cache B).
 * ~6 years of trading days (~250/yr) so the river-chart band spans a long
 * history rather than the legacy 60-day window; trims oldest from the front.
 */
export const VALUATION_SERIES_CAP = 1500;

/** The four financial sub-variants probed, in order, for a 金融保險業 symbol. */
export const FINANCIAL_VARIANTS = ["basi", "mim", "fh", "ins"] as const;
