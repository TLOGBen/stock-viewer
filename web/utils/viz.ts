/**
 * Pure, unit-friendly helpers for the D3 bespoke visualisations
 * (DepthChart, VolumeProfile, Heatmap). No Vue, no DOM, no side effects.
 *
 * d3 usage is confined to scale / shape / array maths in the components; these
 * helpers stay framework-free so they can be exercised in plain unit tests.
 * Tokens are emitted as CSS `var(--token)` strings where a colour is rendered.
 */
import type { Candle, PriceLevel } from "~/types";

/** A single point on a cumulative-depth curve: price level + running size sum. */
export interface DepthPoint {
  /** Price of this level. */
  price: number;
  /** Size at this level alone (張). */
  size: number;
  /** Running total size from the mid outwards through this level (張). */
  cumulative: number;
}

/** One value-area computation result over a set of price/volume bins. */
export interface VolumeProfileResult {
  bins: { price: number; volume: number }[];
  poc: number | null;
  valueAreaHigh: number | null;
  valueAreaLow: number | null;
}

/**
 * Running-sum points for one side of the book. Bids are summed from the best
 * (highest) price down; asks from the best (lowest) price up — i.e. always
 * accumulating outward from the mid so the two step-areas mirror each other.
 *
 * Input order is not trusted: we sort defensively. Non-finite / non-positive
 * levels are dropped. Returns [] for empty input.
 */
export function cumulativeDepth(
  levels: readonly PriceLevel[],
  side: "bid" | "ask",
): DepthPoint[] {
  const clean = levels.filter(
    (l) => Number.isFinite(l.price) && Number.isFinite(l.size) && l.size > 0,
  );
  if (clean.length === 0) return [];

  // Bids accumulate from the highest price downward; asks from the lowest upward.
  const sorted = [...clean].sort((a, b) =>
    side === "bid" ? b.price - a.price : a.price - b.price,
  );

  const points: DepthPoint[] = [];
  let running = 0;
  for (const level of sorted) {
    running += level.size;
    points.push({ price: level.price, size: level.size, cumulative: running });
  }
  return points;
}

/**
 * Bin candle close prices into `binCount` equal-width price buckets, weighting
 * each by that candle's volume, then compute the POC (max-volume bucket price)
 * and a `valueAreaPct` (default 70%) value area by expanding outward from the
 * POC bucket, always taking the larger adjacent neighbour first.
 *
 * Returns empty bins + null markers when there is no usable data (no candles,
 * all-zero volume, or a degenerate price range).
 */
export function binVolumeProfile(
  candles: readonly Candle[],
  binCount: number,
  valueAreaPct = 0.7,
): VolumeProfileResult {
  const empty: VolumeProfileResult = {
    bins: [],
    poc: null,
    valueAreaHigh: null,
    valueAreaLow: null,
  };

  const count = Math.max(1, Math.floor(binCount));
  const usable = candles.filter(
    (c) =>
      Number.isFinite(c.close) &&
      Number.isFinite(c.volume) &&
      c.volume > 0,
  );
  if (usable.length === 0) return empty;

  let min = usable[0]!.close;
  let max = usable[0]!.close;
  for (const c of usable) {
    if (c.close < min) min = c.close;
    if (c.close > max) max = c.close;
  }

  // Degenerate range (single price): one bin holding all volume.
  if (!(max > min)) {
    let vol = 0;
    for (const c of usable) vol += c.volume;
    const bins = [{ price: min, volume: vol }];
    return { bins, poc: min, valueAreaHigh: min, valueAreaLow: min };
  }

  const span = max - min;
  const width = span / count;

  // Bucket centre prices + accumulated volume.
  const volumes = new Array<number>(count).fill(0);
  for (const c of usable) {
    // Clamp the top edge into the last bucket (close === max).
    let idx = Math.floor((c.close - min) / width);
    if (idx >= count) idx = count - 1;
    if (idx < 0) idx = 0;
    volumes[idx] = (volumes[idx] ?? 0) + c.volume;
  }

  const bins = volumes.map((volume, i) => ({
    price: min + (i + 0.5) * width,
    volume,
  }));

  // POC = bucket with the most volume.
  let pocIdx = 0;
  let pocVol = volumes[0] ?? 0;
  for (let i = 1; i < count; i++) {
    const v = volumes[i] ?? 0;
    if (v > pocVol) {
      pocVol = v;
      pocIdx = i;
    }
  }

  let total = 0;
  for (const v of volumes) total += v;
  if (total <= 0) return empty;

  // Expand the value area outward from the POC, greedily taking the larger
  // adjacent neighbour until the target volume share is reached.
  const target = total * Math.min(Math.max(valueAreaPct, 0), 1);
  let lo = pocIdx;
  let hi = pocIdx;
  let acc = volumes[pocIdx] ?? 0;
  while (acc < target && (lo > 0 || hi < count - 1)) {
    const below = lo > 0 ? volumes[lo - 1] ?? 0 : -1;
    const above = hi < count - 1 ? volumes[hi + 1] ?? 0 : -1;
    if (above >= below) {
      hi += 1;
      acc += above;
    } else {
      lo -= 1;
      acc += below;
    }
  }

  const pocBin = bins[pocIdx]!;
  const lowBin = bins[lo]!;
  const highBin = bins[hi]!;
  return {
    bins,
    poc: pocBin.price,
    valueAreaHigh: highBin.price,
    valueAreaLow: lowBin.price,
  };
}

/**
 * Diverging colour for a percent change, returning a token-based CSS string.
 * Positive (漲) → red `--up`, negative (跌) → green `--down`, near-zero → `--flat`.
 *
 * `intensity` scales toward a `-soft` token near the threshold so a weak move
 * reads muted and a strong one reads saturated. `flatEps` is the dead-band
 * (in percent) treated as flat.
 */
export function changeColor(changePercent: number, flatEps = 0.05): string {
  if (!Number.isFinite(changePercent) || Math.abs(changePercent) <= flatEps) {
    return "var(--flat)";
  }
  return changePercent > 0 ? "var(--up)" : "var(--down)";
}

/**
 * A 0..1 intensity for a percent change, saturating at `cap` percent. Useful as
 * an opacity / colour-mix weight so larger moves render more vividly. Always
 * within [0,1]; non-finite input → 0.
 */
export function changeIntensity(changePercent: number, cap = 5): number {
  if (!Number.isFinite(changePercent) || cap <= 0) return 0;
  const ratio = Math.abs(changePercent) / cap;
  return ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
}
