import { Router } from "express";
import { config } from "./config.js";
import type { TwseFeed } from "./twseFeed.js";
import type { UniverseProvider } from "./universe/UniverseProvider.js";
import type { WatchlistStore } from "./watchlist/store.js";
import type { CandleStore } from "./candleStore.js";
import type { HistoryCache } from "./historyCache.js";
import { rollupDaily } from "./historyCache.js";
import { computeStats } from "./marketStats.js";
import { isValidSymbol } from "./validation.js";
import type { Security, Candle, KlineInterval } from "./types.js";

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

/**
 * Build the REST router for the TWSE backend. All responses are JSON.
 * Mounted at "/api" by index.ts.
 */
export interface ApiDeps {
  feed: TwseFeed;
  provider: UniverseProvider;
  watchlist: WatchlistStore;
  candleStore: CandleStore;
  historyCache: HistoryCache;
}

/**
 * Resolve the watchlist symbols to Security rows. Every persisted symbol gets a
 * row — unknown ones (e.g. a fresh IPO not yet in the daily directory, or a
 * failed universe load) fall back to a minimal row rather than silently
 * vanishing from the user's list.
 */
function watchlistItems(
  symbols: string[],
  provider: UniverseProvider,
): Security[] {
  return symbols.map(
    (sym) =>
      provider.get(sym) ?? { symbol: sym, name: sym, exch: "tse", type: "stock" },
  );
}

export function createApiRouter(deps: ApiDeps): Router {
  const { feed, provider, watchlist, candleStore, historyCache } = deps;
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

  router.get("/klines/:symbol", (req, res) => {
    void (async () => {
      const { symbol } = req.params;
      // Reject malformed symbols before they can reach the on-disk cache path
      // (path-traversal guard; Express URL-decodes %2f in route params).
      if (!isValidSymbol(symbol)) {
        res.status(400).json({ error: `Invalid symbol: ${symbol}` });
        return;
      }
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
        let candles: Candle[];
        if (
          interval === "1m" ||
          interval === "5m" ||
          interval === "15m"
        ) {
          // Intraday: served from the in-memory fold (1m/5m/15m only).
          candles = candleStore.getIntraday(symbol, interval, limit);
        } else {
          // Daily/weekly/monthly: backfilled from STOCK_DAY via the cache,
          // rolled up for W/M. Resolve the exchange (default tse).
          const sec = provider.get(symbol);
          const exch = sec?.exch ?? "tse";
          const daily = await historyCache.getDaily(symbol, exch);
          candles =
            interval === "D" ? daily : rollupDaily(daily, interval);
        }
        res.json({ symbol, interval, candles });
      } catch (err) {
        console.error(`[klines] ${symbol}/${interval} failed:`, err);
        res.status(502).json({ error: "Failed to load k-line data" });
      }
    })();
  });

  // ─────────────────────────── Symbol stats (QM-2) ───────────────────────────

  router.get("/stats/:symbol", (req, res) => {
    void (async () => {
      const { symbol } = req.params;
      // Path-traversal guard before the symbol reaches the daily cache file path.
      if (!isValidSymbol(symbol)) {
        res.status(400).json({ error: `Invalid symbol: ${symbol}` });
        return;
      }
      const exch = provider.get(symbol)?.exch ?? "tse";
      try {
        const stats = await computeStats(symbol, exch, historyCache);
        res.json(stats);
      } catch (err) {
        console.error(`[stats] ${symbol} failed:`, err);
        res.status(502).json({ error: "Failed to load symbol stats" });
      }
    })();
  });

  // ─────────────────────────── Universe / search ───────────────────────────

  router.get("/securities", (_req, res) => {
    const securities = provider.all();
    res.json({
      asOf: provider.asOf,
      stale: provider.stale,
      count: securities.length,
      securities,
    });
  });

  router.get("/search", (req, res) => {
    const q = typeof req.query["q"] === "string" ? req.query["q"] : "";
    const rawLimit = req.query["limit"];
    const limit =
      typeof rawLimit === "string" ? Number.parseInt(rawLimit, 10) : undefined;
    const results = provider.search(
      q,
      Number.isFinite(limit) ? limit : undefined,
    );
    res.json({ q, results });
  });

  // ─────────────────────────── Watchlist ───────────────────────────

  router.get("/watchlist", (_req, res) => {
    const symbols = watchlist.get();
    res.json({
      symbols,
      updatedAt: watchlist.updatedAtMs(),
      items: watchlistItems(symbols, provider),
    });
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
    const unknown = requested.filter((s) => provider.get(s) == null);
    if (unknown.length > 0) {
      res.status(400).json({ error: `Unknown symbol(s): ${unknown.join(", ")}` });
      return;
    }

    void watchlist
      .set(requested)
      .then(() => {
        const next = watchlist.get();
        res.json({
          symbols: next,
          updatedAt: watchlist.updatedAtMs(),
          items: watchlistItems(next, provider),
        });
      })
      .catch((err) => {
        console.error("[watchlist] set failed:", err);
        res.status(500).json({ error: "Failed to persist watchlist" });
      });
  });

  router.get("/health", (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  return router;
}
