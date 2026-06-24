/**
 * Domain-wide named constants. Pure, no I/O.
 */

/**
 * Consecutive failed live-feed polls before the official-close fallback engages.
 * Single source of truth — referenced by quoteFeed (fallback trigger) and
 * getHealth (degraded threshold). The goal/requirement docs' "N 次" is this value.
 */
export const FAILURE_THRESHOLD = 3;
