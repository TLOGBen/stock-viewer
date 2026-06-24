import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import { config, INSTRUMENTS } from "./config.js";
import { TwseFeed } from "./twseFeed.js";
import { createApiRouter } from "./restApi.js";
import { createWsServer } from "./wsServer.js";
import { UniverseProvider } from "./universe/UniverseProvider.js";
import { WatchlistStore } from "./watchlist/store.js";
import { CandleStore } from "./candleStore.js";
import { HistoryCache } from "./historyCache.js";

/** Bootstrap the TWSE real-time trading desk backend. */
async function main(): Promise<void> {
  const app = express();
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());

  // Universe directory (cache-first) — load before anything reads it.
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

  // One shared feed instance powers both REST and WebSocket.
  const feed = new TwseFeed({ watchlist, provider, viewed, candleStore });
  app.use(
    "/api",
    createApiRouter({ feed, provider, watchlist, candleStore, historyCache }),
  );

  // Optional bundled SPA (desktop / Electron packaging). When WEB_DIST points at
  // a Nuxt `generate` output, serve it from this same origin with an SPA history
  // fallback, so the whole app is reachable from one local server (no separate
  // web process). Unset in normal dev — Nuxt runs its own dev server then.
  const webDist = process.env.WEB_DIST;
  if (webDist && fs.existsSync(webDist)) {
    const indexHtml = path.join(webDist, "index.html");
    app.use(express.static(webDist));
    // Anything that is not an /api route falls back to the SPA entry. (/ws is a
    // WebSocket upgrade handled below, never an Express GET, so it is unaffected.)
    app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => res.sendFile(indexHtml));
    console.log(`[twse-desk] serving bundled web UI from ${webDist}`);
  }

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
