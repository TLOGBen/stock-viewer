import http from "node:http";
import express from "express";
import { createRequire } from "node:module";
import { config, INSTRUMENTS } from "./config.js";
import { TwseFeed, UniverseProvider } from "./usecase/index.js";
import { createApiRouter, createWsServer } from "./action/index.js";
import {
  corsMiddleware,
  jsonBody,
  mountSpaStatic,
  errorHandler,
} from "./middleware/index.js";
import { WatchlistStore, CandleStore, HistoryCache } from "./persistence/index.js";

/**
 * index.ts — composition root. Assembles the six layers and injects
 * dependencies (adapters → persistence → usecase → action), wires the
 * cross-cutting middleware, then starts the HTTP + WS server. No business
 * logic lives here; each layer is constructed once and passed inward so
 * usecases stay injectable/testable (they never `new` an adapter themselves).
 */

/** App version from package.json (surfaced by /api/health). */
const APP_VERSION: string = (() => {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

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

  // On-demand viewed symbols are shared between the feed and WS layer.
  const viewed = new Set<string>();

  // Intraday candle aggregation (1m/5m/15m fold) and daily history (STOCK_DAY
  // backfill, on-disk cache) — shared by the feed and the REST k-line route.
  const candleStore = new CandleStore();
  const historyCache = new HistoryCache(config.dataDir);

  // ── usecase: one shared feed instance powers both REST and WebSocket ──
  const feed = new TwseFeed({ watchlist, provider, viewed, candleStore });

  // ── action: HTTP routes mounted at /api, delegating to usecases ──
  app.use(
    "/api",
    createApiRouter({
      feed,
      provider,
      watchlist,
      candleStore,
      historyCache,
      version: APP_VERSION,
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
