/**
 * upsertSeries — the one shared primitive behind the per-symbol snapshot series
 * caches (月營收 / EPS / 股利 / 資產負債). opendata endpoints only ever return the
 * latest period for the whole market, so a stock's history is built by folding
 * each fresh snapshot into a key-deduplicated, capped series over time.
 *
 * Per review R5 this is the ONLY thing the series caches share — a pure,
 * stateless domain function, NOT a pre-abstracted generic cache class. Returns
 * a new array; never mutates the input (immutability rule). Latest write wins
 * for a given key; callers append newest-last, so the cap trims from the front.
 */
export function upsertSeries<T>(
  list: readonly T[],
  item: T,
  keyFn: (x: T) => string,
  cap: number,
): T[] {
  const key = keyFn(item);
  const without = list.filter((x) => keyFn(x) !== key);
  const next = [...without, item];
  if (cap > 0 && next.length > cap) return next.slice(next.length - cap);
  return next;
}
