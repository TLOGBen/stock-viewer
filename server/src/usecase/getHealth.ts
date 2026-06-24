import {
  computeMarketStatus,
  FAILURE_THRESHOLD,
  type FeedHealth,
  type HealthReport,
} from "../domain/index.js";

/**
 * usecase/getHealth — aggregate feed + universe + market + uptime/version into a
 * single `HealthReport` for the `/api/health` dashboard.
 *
 * The status traffic light (pure `rollupStatus`) is the load-bearing decision:
 *   - `down`     — the feed never produced a tick AND there is nothing to show
 *                  (no snapshot, no official fallback rows).
 *   - `degraded` — the official-close fallback is active, OR consecutive failures
 *                  have reached the threshold but there is still some snapshot.
 *   - `ok`       — otherwise (recent successful ticks).
 *
 * Sub-system values are read through narrow injected accessors so this usecase is
 * unit-testable with plain fakes and never `new`s an adapter or store.
 */

/** Minimal view of the feed this usecase needs (a `TwseFeed` satisfies it). */
export interface FeedHealthSource {
  getHealth(now: number): FeedHealth;
}

/** Minimal view of the universe service this usecase needs. */
export interface UniverseHealthSource {
  all(): { length: number };
  stale: boolean;
  asOf: number;
}

export interface GetHealthDeps {
  feed: FeedHealthSource;
  universe: UniverseHealthSource;
  /** Process uptime in ms (injected so the usecase stays pure/testable). */
  uptimeMs: () => number;
  /** App version string (e.g. package.json version). */
  version: string;
}

/**
 * Pure three-state roll-up. `down` only when the feed never ticked AND there is
 * nothing to display (no snapshot, no official rows). Any fallback fill or live
 * tick lifts it above `down`.
 */
export function rollupStatus(feed: FeedHealth): HealthReport["status"] {
  const hasAnyData =
    feed.snapshotCount > 0 || feed.officialCache.size > 0;

  if (feed.lastTickAt === 0 && !hasAnyData) {
    return "down";
  }
  if (
    feed.fallbackActive ||
    feed.consecutiveFailures >= FAILURE_THRESHOLD
  ) {
    return "degraded";
  }
  return "ok";
}

/** Build the aggregate HealthReport at instant `now`. */
export function getHealth(deps: GetHealthDeps, now: number = Date.now()): HealthReport {
  const feed = deps.feed.getHealth(now);
  return {
    status: rollupStatus(feed),
    uptimeMs: deps.uptimeMs(),
    serverTime: now,
    version: deps.version,
    market: computeMarketStatus(now),
    feed,
    universe: {
      count: deps.universe.all().length,
      stale: deps.universe.stale,
      asOf: deps.universe.asOf,
    },
  };
}
