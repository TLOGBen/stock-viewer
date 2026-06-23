import http from "node:http";
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

  const server = http.createServer(app);
  const wss = createWsServer(server, feed);

  feed.start();

  // Background universe refresh (daily by default); never blocks shutdown.
  const refreshTimer = setInterval(() => {
    void provider.refresh(config);
  }, config.universeRefreshMs);
  refreshTimer.unref();

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
