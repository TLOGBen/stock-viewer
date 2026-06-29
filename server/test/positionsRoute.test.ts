import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import express from "express";

import { createApiRouter, type ApiDeps } from "../src/action/index.js";
import { corsMiddleware, jsonBody } from "../src/middleware/index.js";
import { PositionBookStore } from "../src/persistence/index.js";
import { DEFAULT_CASH } from "../src/domain/index.js";

/**
 * Integration test for GET/PUT /api/positions: mount the real router + middleware
 * over a real express server backed by a real PositionBookStore in a tmp dir.
 * Only the position-book dep is real; the rest are fakes the routes never touch.
 */
function makeDeps(positionBook: PositionBookStore): ApiDeps {
  return {
    feed: {} as ApiDeps["feed"],
    provider: {} as ApiDeps["provider"],
    watchlist: {} as ApiDeps["watchlist"],
    positionBook,
    candleStore: {} as ApiDeps["candleStore"],
    historyCache: {} as ApiDeps["historyCache"],
    version: "9.9.9",
  };
}

function startServer(
  positionBook: PositionBookStore,
): Promise<{ server: http.Server; port: number }> {
  const app = express();
  app.use(corsMiddleware());
  app.use(jsonBody());
  app.use("/api", createApiRouter(makeDeps(positionBook)));
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

async function req(
  port: number,
  method: "GET" | "PUT",
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`http://127.0.0.1:${port}/api/positions`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

describe("GET/PUT /api/positions", () => {
  let dataDir: string;
  let server: http.Server;
  let port: number;
  let store: PositionBookStore;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "positions-route-"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    store = new PositionBookStore(dataDir);
    await store.load();
    ({ server, port } = await startServer(store));
  });

  afterEach(async () => {
    server.close();
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("GET returns the default empty book before anything is saved", async () => {
    const { status, json } = await req(port, "GET");
    expect(status).toBe(200);
    expect(json).toEqual({
      positions: {},
      cashBalance: DEFAULT_CASH,
      updatedAt: 0,
    });
  });

  it("PUT persists the book and a subsequent GET reflects it (落檔)", async () => {
    const book = {
      positions: {
        "2330": { symbol: "2330", lots: 3, avgPrice: 1000, realized: 0 },
      },
      cashBalance: 6_000_000,
    };
    const put = await req(port, "PUT", book);
    expect(put.status).toBe(200);
    expect(put.json.positions).toEqual(book.positions);
    expect(put.json.cashBalance).toBe(6_000_000);
    expect(put.json.updatedAt).toBeGreaterThan(0);

    // Persisted to disk: a fresh store instance sees the same book.
    const reloaded = new PositionBookStore(dataDir);
    await reloaded.load();
    expect(reloaded.get()).toEqual(book);

    const get = await req(port, "GET");
    expect(get.json.cashBalance).toBe(6_000_000);
  });

  it("PUT normalizes a garbage body instead of 500ing", async () => {
    const put = await req(port, "PUT", { positions: "nope", cashBalance: -5 });
    expect(put.status).toBe(200);
    expect(put.json.positions).toEqual({});
    expect(put.json.cashBalance).toBe(DEFAULT_CASH);
  });
});
