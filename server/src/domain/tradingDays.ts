/**
 * recentTradingDays — a pure generator of recent candidate trading-day tokens in
 * the "YYYYMMDD" form the TWSE rwd by-date endpoints (T86 / TWT49U) expect. No
 * I/O — the layered-architecture purity gate forbids it here.
 *
 * Scope (deliberately conservative): this only skips Saturdays and Sundays. The
 * official market calendar (Lunar New Year, national holidays, typhoon days) is
 * NOT modeled — those simply resolve to an empty whole-market report upstream,
 * and the by-date cache already skips any day that yields an empty map
 * (BulkByDateCache.getRecentDays). So an over-generated holiday candidate is a
 * harmless no-op, never a wrong value. We over-fetch the calendar window by a
 * margin so `count` real weekday tokens are always returned even across a long
 * weekend.
 *
 * Ordering: newest-first (index 0 = the most recent weekday on/before `now`),
 * matching BulkByDateCache.getRecentDays' newest-first contract and the
 * chip-scoring inputs (index 0 = latest day).
 */

/** Milliseconds in one calendar day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Format a Date as a "YYYYMMDD" token in UTC. */
function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** True for a Saturday or Sunday (UTC). */
function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay(); // 0=Sun .. 6=Sat
  return dow === 0 || dow === 6;
}

/**
 * Return up to `count` recent weekday "YYYYMMDD" tokens, newest-first, walking
 * back from `now` (inclusive of today when it is a weekday). Weekends are
 * skipped; market holidays are not modeled (they degrade to empty maps upstream
 * and are skipped by the cache). `count` ≤ 0 returns [].
 */
export function recentTradingDays(now: Date, count: number): string[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  const out: string[] = [];
  // Anchor to UTC midnight of `now` so the token math is calendar-stable.
  let cursor = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  // A hard walk-back bound so a degenerate input can never loop unbounded.
  const maxSteps = count * 3 + 14;
  for (let step = 0; step < maxSteps && out.length < count; step += 1) {
    const d = new Date(cursor);
    if (!isWeekend(d)) out.push(yyyymmdd(d));
    cursor -= DAY_MS;
  }
  return out;
}
