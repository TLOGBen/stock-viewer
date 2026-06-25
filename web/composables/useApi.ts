/**
 * REST client for the trading-desk backend. Reads the public runtime config
 * for the API base and WebSocket URL. All fetches are wrapped so a failed
 * request yields a sensible default rather than throwing into the UI.
 */
import type {
  InstrumentMeta,
  Quote,
  MarketStatus,
  Security,
  Candle,
  KlineInterval,
  SymbolStats,
  HealthReport,
  CompanyView,
  RevenueView,
  FinancialsView,
  DividendsView,
  InstitutionalView,
  DisclosuresView,
  MarginView,
  ValuationView,
  HealthLights,
} from "~/types";

export function useApi(): {
  apiBase: string;
  wsUrl: string;
  fetchInstruments(): Promise<InstrumentMeta[]>;
  fetchQuotes(): Promise<{ quotes: Quote[]; market: MarketStatus }>;
  fetchHistory(symbol: string): Promise<number[]>;
  fetchKlines(symbol: string, interval: KlineInterval): Promise<Candle[]>;
  fetchStats(symbol: string): Promise<SymbolStats>;
  searchSecurities(q: string, limit?: number): Promise<Array<Security & { rank: number }>>;
  fetchSecurities(): Promise<Security[]>;
  getWatchlist(): Promise<{ symbols: string[]; items: Security[] }>;
  putWatchlist(symbols: string[]): Promise<{ symbols: string[]; items: Security[] }>;
  fetchHealth(): Promise<HealthReport | null>;
  fetchCompany(symbol: string): Promise<CompanyView | null>;
  fetchRevenue(symbol: string): Promise<RevenueView | null>;
  fetchFinancials(symbol: string): Promise<FinancialsView | null>;
  fetchDividends(symbol: string): Promise<DividendsView | null>;
  fetchInstitutional(symbol: string): Promise<InstitutionalView | null>;
  fetchMargin(symbol: string): Promise<MarginView | null>;
  fetchValuation(symbol: string): Promise<ValuationView | null>;
  fetchHealthLights(symbol: string): Promise<HealthLights | null>;
  fetchDisclosures(symbol: string): Promise<DisclosuresView | null>;
} {
  const cfg = useRuntimeConfig().public;
  const apiBase = cfg.apiBase;
  const wsUrl = cfg.wsUrl;

  const closedMarket: MarketStatus = {
    isOpen: false,
    session: "closed",
    serverTime: Date.now(),
    label: "未連線",
  };

  async function fetchInstruments(): Promise<InstrumentMeta[]> {
    try {
      const res = await $fetch<{ instruments: InstrumentMeta[] }>(
        `${apiBase}/api/instruments`,
      );
      return res?.instruments ?? [];
    } catch (error) {
      console.error("fetchInstruments failed:", error);
      return [];
    }
  }

  async function fetchQuotes(): Promise<{
    quotes: Quote[];
    market: MarketStatus;
  }> {
    try {
      const res = await $fetch<{ quotes: Quote[]; market: MarketStatus }>(
        `${apiBase}/api/quotes`,
      );
      return {
        quotes: res?.quotes ?? [],
        market: res?.market ?? closedMarket,
      };
    } catch (error) {
      console.error("fetchQuotes failed:", error);
      return { quotes: [], market: closedMarket };
    }
  }

  async function fetchHistory(symbol: string): Promise<number[]> {
    try {
      const res = await $fetch<{ symbol: string; points: number[] }>(
        `${apiBase}/api/history/${encodeURIComponent(symbol)}`,
      );
      return res?.points ?? [];
    } catch (error) {
      console.error("fetchHistory failed:", error);
      return [];
    }
  }

  /**
   * Fetch up to 400 OHLCV bars for `symbol` at `interval`. Candles are returned
   * in KLineChart-native shape (`{timestamp,open,high,low,close,volume}`), so no
   * per-bar remap is needed. Returns [] on any failure (never throws into UI).
   */
  async function fetchKlines(
    symbol: string,
    interval: KlineInterval,
  ): Promise<Candle[]> {
    if (!symbol) return [];
    try {
      const res = await $fetch<{ symbol: string; candles: Candle[] }>(
        `${apiBase}/api/klines/${encodeURIComponent(symbol)}`,
        { query: { interval, limit: 400 } },
      );
      return res?.candles ?? [];
    } catch (error) {
      console.error("fetchKlines failed:", error);
      return [];
    }
  }

  /**
   * Summary stats (52w high/low, 20-day avg volume, amplitude, market cap) for
   * `symbol`. Returns an all-null SymbolStats on any failure — never throws.
   */
  async function fetchStats(symbol: string): Promise<SymbolStats> {
    const nullStats: SymbolStats = {
      symbol,
      week52High: null,
      week52Low: null,
      avgVolume20: null,
      marketCap: null,
      amplitude: null,
    };
    if (!symbol) return nullStats;
    try {
      const res = await $fetch<SymbolStats>(
        `${apiBase}/api/stats/${encodeURIComponent(symbol)}`,
      );
      return res ?? nullStats;
    } catch (error) {
      console.error("fetchStats failed:", error);
      return nullStats;
    }
  }

  /** Full-market typeahead. Returns ranked results; [] on any failure. */
  async function searchSecurities(
    q: string,
    limit = 20,
  ): Promise<Array<Security & { rank: number }>> {
    const trimmed = q.trim();
    if (trimmed.length === 0) return [];
    try {
      const res = await $fetch<{
        q: string;
        results: Array<Security & { rank: number }>;
      }>(`${apiBase}/api/search`, { query: { q: trimmed, limit } });
      return res?.results ?? [];
    } catch (error) {
      console.error("searchSecurities failed:", error);
      return [];
    }
  }

  /** Full universe catalogue snapshot. Returns [] on any failure. */
  async function fetchSecurities(): Promise<Security[]> {
    try {
      const res = await $fetch<{
        asOf: number;
        stale: boolean;
        count: number;
        securities: Security[];
      }>(`${apiBase}/api/securities`);
      return res?.securities ?? [];
    } catch (error) {
      console.error("fetchSecurities failed:", error);
      return [];
    }
  }

  /** Current persisted watchlist (symbols + resolved Security rows). */
  async function getWatchlist(): Promise<{
    symbols: string[];
    items: Security[];
  }> {
    try {
      const res = await $fetch<{
        symbols: string[];
        updatedAt: number;
        items: Security[];
      }>(`${apiBase}/api/watchlist`);
      return { symbols: res?.symbols ?? [], items: res?.items ?? [] };
    } catch (error) {
      console.error("getWatchlist failed:", error);
      return { symbols: [], items: [] };
    }
  }

  /**
   * Replace the watchlist with `symbols`. On failure (including 400 unknown
   * symbol) returns the symbols we attempted with no resolved items, so the
   * caller can fall back to current state rather than throwing into the UI.
   */
  async function putWatchlist(
    symbols: string[],
  ): Promise<{ symbols: string[]; items: Security[] }> {
    try {
      const res = await $fetch<{
        symbols: string[];
        updatedAt: number;
        items: Security[];
      }>(`${apiBase}/api/watchlist`, {
        method: "PUT",
        body: { symbols },
      });
      return { symbols: res?.symbols ?? symbols, items: res?.items ?? [] };
    } catch (error) {
      console.error("putWatchlist failed:", error);
      return { symbols, items: [] };
    }
  }

  /**
   * System health snapshot (`/api/health`). Returns null on any failure so the
   * dashboard can render a disconnected state rather than throwing into the UI.
   */
  async function fetchHealth(): Promise<HealthReport | null> {
    try {
      const res = await $fetch<HealthReport>(`${apiBase}/api/health`);
      return res ?? null;
    } catch (error) {
      console.error("fetchHealth failed:", error);
      return null;
    }
  }

  /**
   * Read-only 個股頁 fetcher factory. Every stock-page endpoint shares the same
   * never-throw shape: validate the symbol, GET `/api/<path>/<symbol>`, and
   * return the parsed view (or `null` on any failure — empty symbol, network
   * error, or a 502 from the backend). The composables layer maps `null` to an
   * `error` ResourceStatus so the UI degrades gracefully (never throws).
   */
  function stockPageFetcher<T>(
    path: string,
    tag: string,
  ): (symbol: string) => Promise<T | null> {
    return async (symbol: string): Promise<T | null> => {
      if (!symbol) return null;
      try {
        const res = await $fetch<T>(
          `${apiBase}/api/${path}/${encodeURIComponent(symbol)}`,
        );
        return res ?? null;
      } catch (error) {
        console.error(`${tag} failed:`, error);
        return null;
      }
    };
  }

  /** 公司基本資料 (`/api/company`). null on any failure. */
  const fetchCompany = stockPageFetcher<CompanyView>("company", "fetchCompany");
  /** 月營收序列 (`/api/revenue`). null on any failure. */
  const fetchRevenue = stockPageFetcher<RevenueView>("revenue", "fetchRevenue");
  /** 損益/資產負債 + ROE/負債比 (`/api/financials`). null on any failure. */
  const fetchFinancials = stockPageFetcher<FinancialsView>(
    "financials",
    "fetchFinancials",
  );
  /** 股利/除權息 (`/api/dividends`). null on any failure. */
  const fetchDividends = stockPageFetcher<DividendsView>(
    "dividends",
    "fetchDividends",
  );
  /** 三大法人 (`/api/institutional`). null on any failure. */
  const fetchInstitutional = stockPageFetcher<InstitutionalView>(
    "institutional",
    "fetchInstitutional",
  );
  /** 融資融券 (`/api/margin`). null on any failure. */
  const fetchMargin = stockPageFetcher<MarginView>("margin", "fetchMargin");
  /** PE/PB 河流圖 band (`/api/valuation`). null on any failure. */
  const fetchValuation = stockPageFetcher<ValuationView>(
    "valuation",
    "fetchValuation",
  );
  /** 四燈號健診 (`/api/health-lights`). null on any failure. */
  const fetchHealthLights = stockPageFetcher<HealthLights>(
    "health-lights",
    "fetchHealthLights",
  );
  /** 個股重大訊息 (`/api/disclosures`). null on any failure. */
  const fetchDisclosures = stockPageFetcher<DisclosuresView>(
    "disclosures",
    "fetchDisclosures",
  );

  return {
    apiBase,
    wsUrl,
    fetchInstruments,
    fetchQuotes,
    fetchHistory,
    fetchKlines,
    fetchStats,
    searchSecurities,
    fetchSecurities,
    getWatchlist,
    putWatchlist,
    fetchHealth,
    fetchCompany,
    fetchRevenue,
    fetchFinancials,
    fetchDividends,
    fetchInstitutional,
    fetchMargin,
    fetchValuation,
    fetchHealthLights,
    fetchDisclosures,
  };
}
