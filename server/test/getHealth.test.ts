import { describe, expect, it } from "vitest";

import {
  getHealth,
  rollupStatus,
  type GetHealthDeps,
} from "../src/usecase/getHealth.js";
import { FAILURE_THRESHOLD } from "../src/domain/index.js";
import type { FeedHealth } from "../src/domain/types.js";

/**
 * Unit tests for the usecase/getHealth aggregation + three-state status rule.
 * Pure fakes — no adapters, no stores.
 */

function feed(partial: Partial<FeedHealth>): FeedHealth {
  return {
    consecutiveFailures: 0,
    lastTickAt: 0,
    lastTickAgeMs: null,
    lastError: null,
    fallbackActive: false,
    activeSymbols: 0,
    snapshotCount: 0,
    officialCache: { size: 0, ageMs: null },
    ...partial,
  };
}

function depsFor(f: FeedHealth): GetHealthDeps {
  return {
    feed: { getHealth: () => f },
    universe: { all: () => ({ length: 5 }), stale: false, asOf: 123 },
    uptimeMs: () => 4242,
    version: "9.9.9",
  };
}

describe("rollupStatus", () => {
  it("is `ok` when there are live ticks and no fallback", () => {
    const f = feed({
      lastTickAt: 1_000,
      lastTickAgeMs: 50,
      snapshotCount: 8,
    });
    expect(rollupStatus(f)).toBe("ok");
  });

  it("is `degraded` when the official-close fallback is active", () => {
    const f = feed({
      consecutiveFailures: FAILURE_THRESHOLD,
      fallbackActive: true,
      snapshotCount: 3,
      officialCache: { size: 100, ageMs: 1000 },
    });
    expect(rollupStatus(f)).toBe("degraded");
  });

  it("is `degraded` at the failure threshold with a surviving snapshot", () => {
    const f = feed({
      consecutiveFailures: FAILURE_THRESHOLD,
      lastTickAt: 1_000,
      snapshotCount: 8,
      fallbackActive: false,
    });
    expect(rollupStatus(f)).toBe("degraded");
  });

  it("is `down` when the feed never ticked and nothing is fillable", () => {
    const f = feed({
      lastTickAt: 0,
      snapshotCount: 0,
      officialCache: { size: 0, ageMs: null },
    });
    expect(rollupStatus(f)).toBe("down");
  });

  it("is NOT `down` (→ degraded) once fallback fills something", () => {
    const f = feed({
      lastTickAt: 0,
      consecutiveFailures: FAILURE_THRESHOLD,
      fallbackActive: true,
      snapshotCount: 2,
      officialCache: { size: 100, ageMs: 10 },
    });
    expect(rollupStatus(f)).toBe("degraded");
  });
});

describe("getHealth aggregation", () => {
  it("rolls up feed + universe + market + uptime/version into a HealthReport", () => {
    const f = feed({ lastTickAt: 1_000, snapshotCount: 8, lastTickAgeMs: 5 });
    const now = Date.UTC(2026, 5, 22, 2, 0); // 10:00 TPE Mon → market open
    const report = getHealth(depsFor(f), now);

    expect(report.status).toBe("ok");
    expect(report.uptimeMs).toBe(4242);
    expect(report.serverTime).toBe(now);
    expect(report.version).toBe("9.9.9");
    expect(report.feed).toBe(f);
    expect(report.universe).toEqual({ count: 5, stale: false, asOf: 123 });
    expect(report.market.isOpen).toBe(true);
  });

  it("reflects fallbackActive as degraded in the rolled-up status", () => {
    const f = feed({ fallbackActive: true, snapshotCount: 1 });
    const report = getHealth(depsFor(f), Date.now());
    expect(report.status).toBe("degraded");
    expect(report.feed.fallbackActive).toBe(true);
  });
});
