import { Router } from "express";
import { config } from "../config.js";
import type { TwseFeed } from "../usecase/quoteFeed.js";
import type { UniverseProvider } from "../usecase/universeService.js";
import type { WatchlistStore } from "../persistence/index.js";
import type { CandleStore } from "../persistence/index.js";
import type { HistoryCache } from "../persistence/index.js";
import type { KlineInterval } from "../domain/index.js";
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

  return router;
}
