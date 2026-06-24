import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TwseFeed } from "../src/usecase/quoteFeed.js";
import { OfficialCloseCache } from "../src/persistence/index.js";
import type { MisClient } from "../src/adapters/index.js";
import type { Quote, Security, InstrumentMeta } from "../src/domain/types.js";

/**
 * Integration test for the official-close fallback orchestration in
 * usecase/quoteFeed. We inject an always-failing MIS client plus a real
 * OfficialCloseCache backed by a stubbed `fetch` that returns fixed
 * STOCK_DAY_ALL rows, and verify:
 *   - after FAILURE_THRESHOLD (3) failed polls, holes are filled with
 *     official-close quotes (source === "official-close"),
 *   - a symbol that already has a (live) snapshot is NOT overwritten,
 *   - the path never throws.
 */

/** A MisClient whose every batch fetch throws (transport failure). */
const ALWAYS_FAIL_MIS: MisClient = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async fetchBatch(): Promise<unknown | null> {
    throw new Error("MIS down");
  },
};

/** Two-symbol watchlist: 2330 has a pre-seeded live snapshot, 2317 is a hole. */
const WATCH: string[] = ["2330", "2317"];

function fakeWatchlist(): { get(): string[] } {
  return { get: () => WATCH };
}

const SECURITIES: Record<string, Security> = {
  "2330": { symbol: "2330", name: "台積電", exch: "tse", type: "stock" },
  "2317": { symbol: "2317", name: "鴻海", exch: "tse", type: "stock" },
};

function fakeProvider(): { get(symbol: string): Security | undefined } {
  return { get: (s) => SECURITIES[s] };
}

/** A CandleStore stub — fallback quotes (tlong=0/price set) never call ingestTick on the live path here. */
function fakeCandleStore(): { ingestTick: () => never[] } {
  return { ingestTick: () => [] };
}

/** Stub fetch returning a fixed STOCK_DAY_ALL body for 2330 + 2317. */
function stubFetch(): typeof fetch {
  const body = [
    {
      Code: "2330",
      Name: "台積電",
      ClosingPrice: "1000",
      Change: "10",
      TradeVolume: "20000000",
    },
    {
      Code: "2317",
      Name: "鴻海",
      ClosingPrice: "200",
      Change: "-5",
      TradeVolume: "10000000",
    },
  ];
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "official-cache-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("quoteFeed official-close fallback", () => {
  function buildFeed(): TwseFeed {
    const officialFallback = new OfficialCloseCache({
      dataDir,
      fetchImpl: stubFetch(),
    });
    return new TwseFeed({
      watchlist: fakeWatchlist() as never,
      provider: fakeProvider() as never,
      viewed: new Set<string>(),
      candleStore: fakeCandleStore() as never,
      officialFallback,
      misClient: ALWAYS_FAIL_MIS,
    });
  }

  /** Run N poll cycles by reaching into the private poll() method. */
  async function pollN(feed: TwseFeed, n: number): Promise<void> {
    const poll = (feed as unknown as { poll: () => Promise<void> }).poll.bind(
      feed,
    );
    for (let i = 0; i < n; i++) await poll();
  }

  it("does not fill before the failure threshold (2 fails)", async () => {
    const feed = buildFeed();
    await pollN(feed, 2);
    // Below threshold → no fallback fill yet.
    expect(feed.getSnapshot()).toHaveLength(0);
  });

  it("fills empty symbols with official-close after the threshold (3 fails)", async () => {
    const feed = buildFeed();
    const seen: Quote[] = [];
    feed.on("quote", (q) => seen.push(q));

    await pollN(feed, 3);

    const snap = feed.getSnapshot();
    const bySymbol = new Map(snap.map((q) => [q.symbol, q]));

    expect(bySymbol.get("2330")?.source).toBe("official-close");
    expect(bySymbol.get("2330")?.price).toBe(1000);
    expect(bySymbol.get("2317")?.source).toBe("official-close");
    expect(bySymbol.get("2317")?.price).toBe(200);

    // Fallback emitted quotes.
    expect(seen.some((q) => q.source === "official-close")).toBe(true);

    // Health reflects the active fallback.
    const health = feed.getHealth(Date.now());
    expect(health.fallbackActive).toBe(true);
    expect(health.consecutiveFailures).toBeGreaterThanOrEqual(3);
  });

  it("never overwrites an existing snapshot (live wins over fallback)", async () => {
    const feed = buildFeed();

    // Pre-seed a LIVE snapshot for 2330 via the private snapshot map.
    const liveQuote = {
      symbol: "2330",
      exch: "tse",
      name: "台積電",
      fullName: "台積電",
      price: 999,
      prevClose: 990,
      open: 991,
      high: 1001,
      low: 988,
      limitUp: null,
      limitDown: null,
      volume: 123,
      lastVolume: 1,
      change: 9,
      changePercent: 0.9,
      direction: "up",
      tick: "flat",
      bids: [],
      asks: [],
      time: "10:00:00",
      tlong: 0,
      updatedAt: Date.now(),
      source: "mis",
    } satisfies Quote;
    (
      feed as unknown as { snapshot: Map<string, Quote> }
    ).snapshot.set("2330", liveQuote);

    await pollN(feed, 3);

    const snap = feed.getSnapshot();
    const bySymbol = new Map(snap.map((q) => [q.symbol, q]));

    // 2330 keeps its live values, NOT the official-close 1000.
    expect(bySymbol.get("2330")?.price).toBe(999);
    expect(bySymbol.get("2330")?.source).toBe("mis");
    // 2317 (a hole) still gets filled from official close.
    expect(bySymbol.get("2317")?.source).toBe("official-close");
  });

  it("never throws even when official data is also unavailable", async () => {
    const failingFetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const officialFallback = new OfficialCloseCache({
      dataDir,
      fetchImpl: failingFetch,
    });
    const feed = new TwseFeed({
      watchlist: fakeWatchlist() as never,
      provider: fakeProvider() as never,
      viewed: new Set<string>(),
      candleStore: fakeCandleStore() as never,
      officialFallback,
      misClient: ALWAYS_FAIL_MIS,
    });

    await expect(pollN(feed, 3)).resolves.toBeUndefined();
    // No official data + no live data → symbols stay blank, no crash.
    expect(feed.getSnapshot()).toHaveLength(0);
  });
});
