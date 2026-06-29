import http from "node:http";
import express from "express";
import { createRequire } from "node:module";
import { resolveAppVersion } from "./appVersion.js";
import { config, INSTRUMENTS } from "./config.js";
import {
  TwseFeed,
  UniverseProvider,
  fetchDailyCandles,
  VALUATION_SERIES_CAP,
} from "./usecase/index.js";
import type { StockPageDeps } from "./usecase/index.js";
import { createApiRouter, createWsServer } from "./action/index.js";
import {
  corsMiddleware,
  jsonBody,
  mountSpaStatic,
  errorHandler,
} from "./middleware/index.js";
import {
  WatchlistStore,
  PositionBookStore,
  CandleStore,
  HistoryCache,
  BulkByDateCache,
  SnapshotSeriesCache,
} from "./persistence/index.js";
import {
  createFundamentalsClient,
  createChipsClient,
  createValuationClient,
} from "./adapters/index.js";
import {
  parseCompanyRow,
  parseRevenueRow,
  parseFinStatementRow,
  parseBalanceRow,
  parseDividendRow,
  parseT86Row,
  parseMarginRow,
  parseBwibbuRow,
  parseExRightRow,
  parseDisclosureRow,
} from "./domain/index.js";
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
} from "./domain/index.js";

/**
 * index.ts — composition root. Assembles the six layers and injects
 * dependencies (adapters → persistence → usecase → action), wires the
 * cross-cutting middleware, then starts the HTTP + WS server. No business
 * logic lives here; each layer is constructed once and passed inward so
 * usecases stay injectable/testable (they never `new` an adapter themselves).
 */

/**
 * App version surfaced by /api/health. Prefer the bundle-time injected
 * `__APP_VERSION__` (defined from the ROOT package.json by bundle.mjs); in dev
 * (tsx, no bundle) it is undefined, so fall back to reading the ROOT package.json
 * (../../package.json relative to server/src). Either way the health page shows
 * the real desktop release version, not the server's 1.0.0 / a 0.0.0 fallback.
 */
declare const __APP_VERSION__: string | undefined;
const APP_VERSION: string = resolveAppVersion(
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : undefined,
  () =>
    (createRequire(import.meta.url)("../../package.json") as { version?: string })
      .version,
);

/** Base URL for the key-free TWSE OpenAPI opendata directory. */
const OPENDATA_BASE = "https://openapi.twse.com.tw/v1/opendata";

/** opendata income-statement endpoint per financial variant (t187ap06_L_*). */
function finStatementUrl(variant: FinancialVariant): string {
  return `${OPENDATA_BASE}/t187ap06_L_${variant}`;
}

/** opendata balance-sheet endpoint per financial variant (t187ap07_L_*). */
function balanceUrl(variant: FinancialVariant): string {
  return `${OPENDATA_BASE}/t187ap07_L_${variant}`;
}

/** Read a row's 公司代號-style code cell (opendata rows), trimmed; "" when absent. */
function rowCode(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v.trim() : "";
}

/** Days of per-symbol revenue history retained (cache B cap). */
// Raised from 36 so a FinMind backfill (2002→今, ~290 months and growing) is
// retained in full rather than trimmed to the most recent 3 years; ~360 leaves
// headroom for ongoing runtime accumulation (REQ-004 / data group cap fix).
const REVENUE_SERIES_CAP = 360;

/**
 * Assemble the injected 個股頁 (stock-page) dependency surface (REQ-014, C3).
 * This is the ONLY place the stock-page adapters are constructed; each cache is
 * given a fetcher closure that calls one adapter and folds the raw payload
 * through a pure domain parser into the cache's domain-typed shape — the caches
 * themselves never import an adapter (CLAUDE.md persistence invariant). The
 * resulting object is handed to `createApiRouter` as `stockPageDeps` and to the
 * 健康燈號 usecase, which fans out over the same caches.
 *
 * Every fetcher boundary may reject (the clients throw on non-2xx); the caches
 * (`never throw`) and the usecases (try/catch → coverage:false) absorb that, so
 * one dead source degrades a single block rather than failing the page.
 */
function buildStockPageDeps(
  provider: UniverseProvider,
  historyCache: HistoryCache,
): StockPageDeps {
  const dataDir = config.dataDir;
  const fundamentals = createFundamentalsClient();
  const chips = createChipsClient();
  const valuation = createValuationClient();

  // ── per-symbol fetchers over opendata object-row directories ──

  /** ap03 公司基本資料 → the symbol's CompanyProfile (null when absent). */
  const company = async (symbol: string): Promise<CompanyProfile | null> => {
    const rows = await fundamentals.fetchRows(`${OPENDATA_BASE}/t187ap03_L`);
    const row = rows.find((r) => rowCode(r, "公司代號") === symbol);
    return row != null ? parseCompanyRow(row) : null;
  };

  /** ap05 月營收 → the symbol's latest MonthlyRevenue (null when absent). */
  const revenueFetcher = async (
    symbol: string,
  ): Promise<MonthlyRevenue | null> => {
    const rows = await fundamentals.fetchRows(`${OPENDATA_BASE}/t187ap05_L`);
    const row = rows.find((r) => rowCode(r, "公司代號") === symbol);
    return row != null ? parseRevenueRow(row) : null;
  };

  /** ap06_L_{variant} 損益表 → the symbol's FinancialStatement (null when absent). */
  const financials = async (
    symbol: string,
    variant: FinancialVariant,
  ): Promise<FinancialStatement | null> => {
    const rows = await fundamentals.fetchRows(finStatementUrl(variant));
    const row = rows.find((r) => rowCode(r, "公司代號") === symbol);
    return row != null ? parseFinStatementRow(row, variant) : null;
  };

  /** ap07_L_{variant} 資產負債表 → the symbol's BalanceSheet (null when absent). */
  const balance = async (
    symbol: string,
    variant: FinancialVariant,
  ): Promise<BalanceSheet | null> => {
    const rows = await fundamentals.fetchRows(balanceUrl(variant));
    const row = rows.find((r) => rowCode(r, "公司代號") === symbol);
    return row != null ? parseBalanceRow(row) : null;
  };

  /** ap45 股利分派 → the symbol's Dividend series (ascending; [] when absent). */
  const dividends = async (symbol: string): Promise<Dividend[]> => {
    const rows = await fundamentals.fetchRows(`${OPENDATA_BASE}/t187ap45_L`);
    const out: Dividend[] = [];
    for (const r of rows) {
      if (rowCode(r, "公司代號") !== symbol) continue;
      const d = parseDividendRow(r);
      if (d != null) out.push(d);
    }
    return out;
  };

  // ── cache A: by-date whole-market maps (injected per-source fetchers) ──

  /** T86 三大法人 → Map<code, InstitutionalFlow> for one trading day. */
  const institutional = new BulkByDateCache<InstitutionalFlow>(
    dataDir,
    "t86",
    async (date) => {
      const resp = await chips.fetchT86ByDate(date);
      const fields = resp.fields ?? [];
      const data = resp.data ?? [];
      const map = new Map<string, InstitutionalFlow>();
      for (const row of data) {
        const code = String(row[0] ?? "").trim();
        if (code === "") continue;
        map.set(code, parseT86Row(fields, row));
      }
      return map;
    },
  );

  /** MI_MARGN 融資融券 → Map<code, MarginData> (whole-market object rows). */
  const margin = new BulkByDateCache<MarginData>(
    dataDir,
    "margin",
    async () => {
      const rows = await chips.fetchMarginRows();
      const map = new Map<string, MarginData>();
      for (const r of rows) {
        const code = rowCode(r, "股票代號");
        if (code === "") continue;
        map.set(code, parseMarginRow(r));
      }
      return map;
    },
  );

  /** BWIBBU_ALL 估值 → Map<code, ValuationPoint> (whole-market object rows). */
  const valuationCache = new BulkByDateCache<ValuationPoint>(
    dataDir,
    "bwibbu",
    async () => {
      const rows = await valuation.fetchBwibbuRows();
      const map = new Map<string, ValuationPoint>();
      for (const r of rows) {
        const code = rowCode(r, "Code");
        if (code === "") continue;
        map.set(code, parseBwibbuRow(r));
      }
      return map;
    },
  );

  /** TWT49U 除權息 → Map<code, ExDividend>. Code lives in the 股票代號 column. */
  const exRight = new BulkByDateCache<ExDividend>(
    dataDir,
    "twt49u",
    async () => {
      const resp = await valuation.fetchExRight();
      const fields = resp.fields ?? [];
      const data = resp.data ?? [];
      const codeIdx = fields.findIndex(
        (f) => typeof f === "string" && f.trim() === "股票代號",
      );
      const map = new Map<string, ExDividend>();
      if (codeIdx < 0) return map;
      for (const row of data) {
        const code = String(row[codeIdx] ?? "").trim();
        if (code === "") continue;
        map.set(code, parseExRightRow(fields, row));
      }
      return map;
    },
  );

  /** t187ap04_L 即時重大訊息 → Map<code, Disclosure[]> (multiple per code). */
  const disclosures = new BulkByDateCache<Disclosure[]>(
    dataDir,
    "disclosure",
    async () => {
      const rows = await fundamentals.fetchRows(`${OPENDATA_BASE}/t187ap04_L`);
      const map = new Map<string, Disclosure[]>();
      for (const r of rows) {
        const d = parseDisclosureRow(r);
        if (d == null) continue;
        const arr = map.get(d.symbol);
        if (arr != null) arr.push(d);
        else map.set(d.symbol, [d]);
      }
      return map;
    },
  );

  // ── cache B: per-symbol append-over-time series (月營收) ──
  const revenue = new SnapshotSeriesCache<MonthlyRevenue>(
    dataDir,
    "revenue",
    (item) => item.yearMonth,
    REVENUE_SERIES_CAP,
    revenueFetcher,
  );

  // ── cache B: per-symbol PE/PB series (估值河流圖 long history) ──
  // The BWIBBU_ALL snapshot is whole-market; the per-symbol fetcher extracts the
  // symbol's latest row so the series folds one fresh day per upsert. The
  // build-time seed populates the multi-year backfill (integration group).
  const valuationSeries = new SnapshotSeriesCache<ValuationPoint>(
    dataDir,
    "valuation-series",
    (item) => item.date,
    VALUATION_SERIES_CAP,
    async (symbol) => {
      const rows = await valuation.fetchBwibbuRows();
      const row = rows.find((r) => rowCode(r, "Code") === symbol);
      return row != null ? parseBwibbuRow(row) : null;
    },
  );

  return {
    provider,
    company,
    revenue,
    financials,
    balance,
    dividends,
    institutional,
    margin,
    valuation: valuationCache,
    valuationSeries,
    exRight,
    disclosures,
    history: historyCache,
  };
}

/** Bootstrap the TWSE real-time trading desk backend. */
async function main(): Promise<void> {
  const app = express();
  // ── middleware: cross-cutting concerns for the public HTTP API ──
  app.use(corsMiddleware());
  app.use(jsonBody());

  // ── persistence: load the universe directory (cache-first) before reads ──
  const provider = new UniverseProvider();
  await provider.load(config);

  // Persistent watchlist, seeded from config.INSTRUMENTS on first run.
  const watchlist = new WatchlistStore(
    config.dataDir,
    INSTRUMENTS.map((i) => i.symbol),
  );
  await watchlist.load();

  // Persistent mock position book (positions + buying power), survives restart.
  const positionBook = new PositionBookStore(config.dataDir);
  await positionBook.load();

  // On-demand viewed symbols are shared between the feed and WS layer.
  const viewed = new Set<string>();

  // Intraday candle aggregation (1m/5m/15m fold) and daily history (STOCK_DAY
  // backfill, on-disk cache) — shared by the feed and the REST k-line route.
  const candleStore = new CandleStore();
  const historyCache = new HistoryCache(config.dataDir, fetchDailyCandles);

  // ── usecase: one shared feed instance powers both REST and WebSocket ──
  const feed = new TwseFeed({ watchlist, provider, viewed, candleStore });

  // 個股頁 (stock-page) injected cache surface — adapters→caches wired once here.
  const stockPageDeps = buildStockPageDeps(provider, historyCache);

  // ── action: HTTP routes mounted at /api, delegating to usecases ──
  app.use(
    "/api",
    createApiRouter({
      feed,
      provider,
      watchlist,
      positionBook,
      candleStore,
      historyCache,
      version: APP_VERSION,
      stockPageDeps,
    }),
  );

  // Optional bundled SPA (desktop / Electron packaging). When WEB_DIST points
  // at a Nuxt `generate` output, serve it from this same origin with an SPA
  // history fallback. /ws is a WebSocket upgrade (never an Express GET) so it
  // is unaffected by the non-/api fallback.
  if (mountSpaStatic(app)) {
    console.log(`[twse-desk] serving bundled web UI from ${process.env.WEB_DIST}`);
  }

  // Unified error terminator — any route error funnels here as JSON.
  app.use(errorHandler());

  const server = http.createServer(app);
  const wss = createWsServer(server, feed);

  feed.start();

  // Background universe refresh (daily by default); never blocks shutdown.
  const refreshTimer = setInterval(() => {
    void provider.refresh(config);
  }, config.universeRefreshMs);
  refreshTimer.unref();

  // Fail fast and loud on bind errors (e.g. EADDRINUSE when the port is already
  // taken by a second instance or a stray dev server). Without this the error
  // is unhandled and crashes the process anyway, but the desktop launcher would
  // sit on waitForPort for the full timeout before reporting a generic failure.
  server.on("error", (err) => {
    console.error(`[twse-desk] server failed to bind ${config.host}:${config.port}:`, err);
    process.exit(1);
  });

  server.listen(config.port, config.host, () => {
    console.log(
      `[twse-desk] http://${config.host}:${config.port}  ws://${config.host}:${config.port}/ws  ` +
        `(${provider.all().length} securities, ${watchlist.get().length} watchlist)`,
    );
  });

  /** Graceful shutdown: stop polling, close the server, then exit. */
  function shutdown(): void {
    clearInterval(refreshTimer);
    feed.stop();
    // Drop live clients and close the WS server (clears the heartbeat timer and
    // feed listeners via its "close" handler) so the HTTP server can drain.
    for (const client of wss.clients) client.terminate();
    wss.close();
    server.close(() => process.exit(0));
    // Force-exit if connections refuse to drain in time.
    setTimeout(() => process.exit(0), 3000).unref();
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[twse-desk] fatal startup error:", err);
  process.exit(1);
});
