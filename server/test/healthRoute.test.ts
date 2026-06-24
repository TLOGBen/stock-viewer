import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import express from "express";
import { createApiRouter, type ApiDeps } from "../src/action/index.js";
import { corsMiddleware, jsonBody } from "../src/middleware/index.js";
import type { FeedHealth, HealthReport } from "../src/domain/types.js";

/**
 * Integration test for the `GET /api/health` route (TASK-delivery-02): mount the
 * real action router + middleware on a real express server, issue a real HTTP
 * request, and assert the 200 status and the HealthReport shape. Deps are
 * injected fakes — no network, no real feed/persistence.
 */

function fakeFeedHealth(overrides: Partial<FeedHealth> = {}): FeedHealth {
  return {
    consecutiveFailures: 0,
    lastTickAt: 1_700_000_000_000,
    lastTickAgeMs: 1234,
    lastError: null,
    fallbackActive: false,
    activeSymbols: 8,
    snapshotCount: 8,
    officialCache: { size: 0, ageMs: null },
    ...overrides,
  };
}

/** Build ApiDeps with the minimal fakes the /health route exercises. */
function makeDeps(feedHealth: FeedHealth): ApiDeps {
  const feed = {
    getHealth: () => feedHealth,
  } as unknown as ApiDeps["feed"];
  const provider = {
    all: () => ({ length: 42 }),
    stale: false,
    asOf: 1_700_000_000_000,
  } as unknown as ApiDeps["provider"];
  return {
    feed,
    provider,
    watchlist: {} as ApiDeps["watchlist"],
    candleStore: {} as ApiDeps["candleStore"],
    historyCache: {} as ApiDeps["historyCache"],
    version: "9.9.9",
  };
}

function startServer(feedHealth: FeedHealth): Promise<{
  server: http.Server;
  port: number;
}> {
  const app = express();
  app.use(corsMiddleware());
  app.use(jsonBody());
  app.use("/api", createApiRouter(makeDeps(feedHealth)));
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

function getJson(
  port: number,
  path: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path }, (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: raw ? JSON.parse(raw) : null,
          });
        });
      })
      .on("error", reject);
  });
}

describe("GET /api/health (action + middleware + usecase integration)", () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await startServer(fakeFeedHealth()));
  });

  afterAll(() => {
    server.close();
  });

  it("returns 200 with a structurally complete HealthReport", async () => {
    const { status, body } = await getJson(port, "/api/health");
    expect(status).toBe(200);
    const report = body as HealthReport;
    expect(["ok", "degraded", "down"]).toContain(report.status);
    expect(typeof report.uptimeMs).toBe("number");
    expect(typeof report.serverTime).toBe("number");
    expect(report.version).toBe("9.9.9");
    expect(report.market).toBeTypeOf("object");
    expect(report.feed).toBeTypeOf("object");
    expect(report.feed.officialCache).toBeTypeOf("object");
    expect(report.universe).toEqual({
      count: 42,
      stale: false,
      asOf: 1_700_000_000_000,
    });
  });

  it("status is ok when the feed has live ticks and no fallback", async () => {
    const { body } = await getJson(port, "/api/health");
    expect((body as HealthReport).status).toBe("ok");
  });

  it("reflects degraded status when fallback is active", async () => {
    const { server: s2, port: p2 } = await startServer(
      fakeFeedHealth({ fallbackActive: true }),
    );
    try {
      const { status, body } = await getJson(p2, "/api/health");
      expect(status).toBe(200);
      const report = body as HealthReport;
      expect(report.status).toBe("degraded");
      expect(report.feed.fallbackActive).toBe(true);
    } finally {
      s2.close();
    }
  });
});
