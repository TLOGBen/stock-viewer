import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { TwseFeed, CandleEvent } from "./twseFeed.js";
import type { Quote, MarketStatus, ServerMessage } from "./types.js";

/** A WebSocket with a heartbeat liveness flag. */
interface LiveSocket extends WebSocket {
  isAlive?: boolean;
}

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Attach a WebSocketServer to the given HTTP server on path "/ws".
 * Sends a snapshot on connect, broadcasts feed quote/market events,
 * and drops dead clients via a ping/pong heartbeat.
 */
export function createWsServer(
  httpServer: HttpServer,
  feed: TwseFeed,
): WebSocketServer {
  // maxPayload caps inbound frames far above what a ping/view message needs
  // (default is 100 MiB) so a client can't push huge frames at the server.
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    maxPayload: 64 * 1024,
  });

  function broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  const onQuote = (quote: Quote): void => {
    broadcast({ type: "quote", quote });
  };
  const onMarket = (market: MarketStatus): void => {
    broadcast({ type: "market", market });
  };
  const onCandle = (event: CandleEvent): void => {
    broadcast({
      type: "candle",
      symbol: event.symbol,
      interval: event.interval,
      candle: event.candle,
      closed: event.closed,
    });
  };

  feed.on("quote", onQuote);
  feed.on("market", onMarket);
  feed.on("candle", onCandle);

  wss.on("connection", (ws: LiveSocket) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    // Send the initial snapshot to the freshly connected client.
    const snapshot: ServerMessage = {
      type: "snapshot",
      quotes: feed.getSnapshot(),
      market: feed.getMarket(),
      history: feed.getHistory(),
    };
    ws.send(JSON.stringify(snapshot));

    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as {
          type?: string;
          symbol?: unknown;
        };
        // The client is mostly read-only; {type:"ping"} is a no-op keepalive.
        if (parsed.type === "ping") {
          // noop
        } else if (
          parsed.type === "view" &&
          typeof parsed.symbol === "string" &&
          parsed.symbol.trim() !== ""
        ) {
          // On-demand subscribe: register the viewed symbol, then push this
          // client a fresh snapshot so the new symbol streams immediately.
          feed.addView(parsed.symbol);
          const fresh: ServerMessage = {
            type: "snapshot",
            quotes: feed.getSnapshot(),
            market: feed.getMarket(),
            history: feed.getHistory(),
          };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(fresh));
          }
        }
      } catch {
        // Ignore malformed inbound frames.
      }
    });

    ws.on("error", () => {
      // Swallow per-socket errors; the heartbeat reaper handles cleanup.
    });
  });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const socket = client as LiveSocket;
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => {
    clearInterval(heartbeat);
    feed.off("quote", onQuote);
    feed.off("market", onMarket);
    feed.off("candle", onCandle);
  });

  return wss;
}
