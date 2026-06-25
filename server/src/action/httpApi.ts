import { Router, type Response } from "express";
import { config } from "../config.js";
import type { TwseFeed } from "../usecase/quoteFeed.js";
import type { UniverseProvider } from "../usecase/universeService.js";
import type { WatchlistStore } from "../persistence/index.js";
import type { CandleStore } from "../persistence/index.js";
import type { HistoryCache } from "../persistence/index.js";
import type { KlineInterval } from "../domain/index.js";
import { industryVariant } from "../domain/index.js";
import { validateSymbol } from "../middleware/index.js";
import {
  getKlines,
  searchUniverse,
  listSecurities,
  getWatchlist,
  setWatchlist,
  unknownSymbols,
  getMarketStats,
  getHealth,
  getCompany,
  getRevenue,
  getFinancials,
  getDividends,
  getInstitutional,
  getMargin,
  getValuation,
  getHealthLights,
  getDisclosures,
  type StockPageDeps,
} from "../usecase/index.js";

/**
 * action/httpApi — the HTTP entry point. Each route only validates the request,
 * delegates to a `usecase/*` function, and serializes the result. No business
 * logic lives here. Mounted at "/api" by index.ts. Symbol-bearing routes use
 * the `validateSymbol` middleware (path-traversal guard, uniform 400 shape).
 */

/** All valid k-line interval tokens (intraday + daily roll-ups). */
const VALID_INTERVALS: readonly KlineInterval[] = [
  "1m",
  "5m",
  "15m",
  "D",
  "W",
  "M",
];
const DEFAULT_KLINE_LIMIT = 300;
const MAX_KLINE_LIMIT = 1000;

/** Narrow an arbitrary string to a KlineInterval, or null when invalid. */
function parseInterval(raw: string): KlineInterval | null {
  return (VALID_INTERVALS as readonly string[]).includes(raw)
    ? (raw as KlineInterval)
    : null;
}

/** Clamp a requested k-line limit into [1, MAX], defaulting when absent/invalid. */
function parseKlineLimit(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_KLINE_LIMIT;
  return Math.min(Math.trunc(n), MAX_KLINE_LIMIT);
}

export interface ApiDeps {
  feed: TwseFeed;
  provider: UniverseProvider;
  watchlist: WatchlistStore;
  candleStore: CandleStore;
  historyCache: HistoryCache;
  /** App version surfaced by /health (defaults to config.version-less fallback). */
  version?: string;
  /**
   * 個股頁 (stock-page) injected cache surface. Optional so the existing 6-field
   * ApiDeps contract is untouched (REQ-014); when absent the stock-page routes
   * are simply not mounted. The composition root's `buildStockPageDeps()` wires
   * adapters→caches→provider into this sub-object.
   */
  stockPageDeps?: StockPageDeps;
}

export function createApiRouter(deps: ApiDeps): Router {
  const { feed, provider, watchlist, candleStore, historyCache } = deps;
  const version = deps.version ?? "0.0.0";
  const router = Router();

  router.get("/instruments", (_req, res) => {
    res.json({ instruments: config.instruments });
  });

  router.get("/quotes", (_req, res) => {
    res.json({ quotes: feed.getSnapshot(), market: feed.getMarket() });
  });

  router.get("/history/:symbol", (req, res) => {
    const { symbol } = req.params;
    // A symbol is "known" if it's in the universe directory OR currently active.
    const known =
      provider.get(symbol) != null ||
      feed.getActiveSymbols().includes(symbol);
    if (!known) {
      res.status(404).json({ error: `Unknown symbol: ${symbol}` });
      return;
    }
    const points = feed.getHistory()[symbol] ?? [];
    res.json({ symbol, points });
  });

  router.get("/market", (_req, res) => {
    res.json(feed.getMarket());
  });

  // ─────────────────────────── K-lines (Phase 3) ───────────────────────────

  router.get("/klines/:symbol", validateSymbol(), (req, res) => {
    void (async () => {
      // validateSymbol middleware has already guaranteed a well-formed symbol.
      const symbol = req.params["symbol"] ?? "";
      const rawInterval =
        typeof req.query["interval"] === "string"
          ? req.query["interval"]
          : "";
      const interval = parseInterval(rawInterval);
      if (interval == null) {
        res.status(400).json({
          error: `Invalid interval: ${rawInterval}. Expected one of ${VALID_INTERVALS.join(", ")}`,
        });
        return;
      }
      const limit = parseKlineLimit(req.query["limit"]);

      try {
        const candles = await getKlines(
          { candleStore, historyCache, provider },
          symbol,
          interval,
          limit,
        );
        res.json({ symbol, interval, candles });
      } catch (err) {
        console.error(`[klines] ${symbol}/${interval} failed:`, err);
        res.status(502).json({ error: "Failed to load k-line data" });
      }
    })();
  });

  // ─────────────────────────── Symbol stats (QM-2) ───────────────────────────

  router.get("/stats/:symbol", validateSymbol(), (req, res) => {
    void (async () => {
      // validateSymbol middleware has already guaranteed a well-formed symbol.
      const symbol = req.params["symbol"] ?? "";
      try {
        const stats = await getMarketStats({ historyCache, provider }, symbol);
        res.json(stats);
      } catch (err) {
        console.error(`[stats] ${symbol} failed:`, err);
        res.status(502).json({ error: "Failed to load symbol stats" });
      }
    })();
  });

  // ─────────────────────────── Universe / search ───────────────────────────

  router.get("/securities", (_req, res) => {
    const snap = listSecurities(provider);
    res.json({
      asOf: snap.asOf,
      stale: snap.stale,
      count: snap.securities.length,
      securities: snap.securities,
    });
  });

  router.get("/search", (req, res) => {
    const q = typeof req.query["q"] === "string" ? req.query["q"] : "";
    const rawLimit = req.query["limit"];
    const limit =
      typeof rawLimit === "string" ? Number.parseInt(rawLimit, 10) : undefined;
    const results = searchUniverse(
      provider,
      q,
      Number.isFinite(limit) ? limit : undefined,
    );
    res.json({ q, results });
  });

  // ─────────────────────────── Watchlist ───────────────────────────

  router.get("/watchlist", (_req, res) => {
    res.json(getWatchlist(watchlist, provider));
  });

  router.put("/watchlist", (req, res) => {
    const body = req.body as unknown;
    const symbols =
      body != null &&
      typeof body === "object" &&
      Array.isArray((body as Record<string, unknown>)["symbols"])
        ? ((body as Record<string, unknown>)["symbols"] as unknown[])
        : null;

    if (symbols == null || !symbols.every((s) => typeof s === "string")) {
      res
        .status(400)
        .json({ error: "Body must be { symbols: string[] }" });
      return;
    }

    const requested = symbols as string[];
    const unknown = unknownSymbols(requested, provider);
    if (unknown.length > 0) {
      res.status(400).json({ error: `Unknown symbol(s): ${unknown.join(", ")}` });
      return;
    }

    void setWatchlist(watchlist, provider, requested)
      .then((view) => {
        res.json(view);
      })
      .catch((err) => {
        console.error("[watchlist] set failed:", err);
        res.status(500).json({ error: "Failed to persist watchlist" });
      });
  });

  router.get("/health", (_req, res) => {
    const report = getHealth({
      feed,
      universe: provider,
      uptimeMs: () => Math.round(process.uptime() * 1000),
      version,
    });
    res.json(report);
  });

  // ───────────────────────── 個股頁 (stock-page) ─────────────────────────
  // Mounted only when the optional stock-page deps were injected. Each route
  // validates the symbol (path-traversal guard), delegates to one usecase, and
  // serializes the (never-throwing) view; an unexpected error still funnels to a
  // uniform 502. The usecases themselves degrade to coverage:false rather than
  // throwing, so the 502 path is a true belt-and-braces safety net.
  const sp = deps.stockPageDeps;
  if (sp != null) {
    mountStockPageRoutes(router, sp);
  }

  return router;
}

/**
 * Wire the nine read-only 個股頁 routes onto an existing router. Split out so
 * `createApiRouter` stays readable; every handler is the same validate→delegate→
 * serialize shape with a try/catch 502 net.
 */
function mountStockPageRoutes(router: Router, sp: StockPageDeps): void {
  /** Shared 502 reporter for a failed stock-page route. */
  function fail(res: Response, tag: string, symbol: string, err: unknown): void {
    console.error(`[${tag}] ${symbol} failed:`, err);
    res.status(502).json({ error: `Failed to load ${tag} data` });
  }

  router.get("/company/:symbol", validateSymbol(), (req, res) => {
    const symbol = req.params["symbol"] ?? "";
    void (async () => {
      try {
        res.json(await getCompany({ company: sp.company }, symbol));
      } catch (err) {
        fail(res, "company", symbol, err);
      }
    })();
  });

  router.get("/revenue/:symbol", validateSymbol(), (req, res) => {
    const symbol = req.params["symbol"] ?? "";
    void (async () => {
      try {
        res.json(await getRevenue({ revenue: sp.revenue }, symbol));
      } catch (err) {
        fail(res, "revenue", symbol, err);
      }
    })();
  });

  router.get("/financials/:symbol", validateSymbol(), (req, res) => {
    const symbol = req.params["symbol"] ?? "";
    void (async () => {
      try {
        // The 損益表 sub-variant cannot be told from the 產業別 code alone, so
        // getFinancials only needs the two-way 一般/金融保險 split here. Resolve it
        // from the company profile (absent → default to 一般 `ci`).
        let code = "";
        try {
          const profile = await sp.company(symbol);
          code = profile?.industryCode ?? "";
        } catch (err) {
          console.error(`[financials] ${symbol} industry probe failed:`, err);
        }
        res.json(
          await getFinancials(
            { financials: sp.financials, balance: sp.balance },
            symbol,
            industryVariant(code),
          ),
        );
      } catch (err) {
        fail(res, "financials", symbol, err);
      }
    })();
  });

  router.get("/dividends/:symbol", validateSymbol(), (req, res) => {
    const symbol = req.params["symbol"] ?? "";
    void (async () => {
      try {
        res.json(
          await getDividends(
            { dividends: sp.dividends, exRight: sp.exRight },
            symbol,
          ),
        );
      } catch (err) {
        fail(res, "dividends", symbol, err);
      }
    })();
  });

  router.get("/institutional/:symbol", validateSymbol(), (req, res) => {
    const symbol = req.params["symbol"] ?? "";
    void (async () => {
      try {
        res.json(
          await getInstitutional({ institutional: sp.institutional }, symbol),
        );
      } catch (err) {
        fail(res, "institutional", symbol, err);
      }
    })();
  });

  router.get("/margin/:symbol", validateSymbol(), (req, res) => {
    const symbol = req.params["symbol"] ?? "";
    void (async () => {
      try {
        res.json(await getMargin({ margin: sp.margin }, symbol));
      } catch (err) {
        fail(res, "margin", symbol, err);
      }
    })();
  });

  router.get("/valuation/:symbol", validateSymbol(), (req, res) => {
    const symbol = req.params["symbol"] ?? "";
    void (async () => {
      try {
        res.json(await getValuation({ valuationSeries: sp.valuationSeries }, symbol));
      } catch (err) {
        fail(res, "valuation", symbol, err);
      }
    })();
  });

  router.get("/health-lights/:symbol", validateSymbol(), (req, res) => {
    const symbol = req.params["symbol"] ?? "";
    void (async () => {
      try {
        res.json(await getHealthLights(sp, symbol));
      } catch (err) {
        fail(res, "health-lights", symbol, err);
      }
    })();
  });

  router.get("/disclosures/:symbol", validateSymbol(), (req, res) => {
    const symbol = req.params["symbol"] ?? "";
    void (async () => {
      try {
        res.json(await getDisclosures({ disclosures: sp.disclosures }, symbol));
      } catch (err) {
        fail(res, "disclosures", symbol, err);
      }
    })();
  });
}
