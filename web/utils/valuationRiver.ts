/**
 * Pure geometry helpers for the ValuationRiver chart (PE/PB 河流圖). No Vue, no
 * DOM, no d3 — just the maths that turns a {@link ValuationBand} into the SVG
 * lane rectangles + the current-price marker position, so the component stays a
 * thin template over these unit-tested functions.
 *
 * The "river" is four stacked horizontal lanes mapped from a band's quantile
 * cuts (min · p20 · p40 · p60 · p80 · max). The current ratio is projected onto
 * the same min→max scale to place a marker, and its zone (cheap / fair /
 * expensive) drives the marker colour via the 紅漲綠跌 idiom inversion below.
 *
 * 估值語意 (valuation, not price): a cheap valuation is bullish → red `--up`; an
 * expensive valuation is bearish → green `--down`; fair → flat. This matches the
 * site-wide rule (看漲=紅) used by the four-light gauge, applied to value rather
 * than to a price delta.
 */
import type { ValuationBand } from "~/types";

/** One horizontal quantile lane of the river, as a fraction of the band span. */
export interface RiverLane {
  /** Lane key, low→high valuation. */
  key: "p0_20" | "p20_40" | "p40_60" | "p60_80" | "p80_100";
  /** Human label for the lane (e.g. "便宜"). */
  label: string;
  /** Lower ratio bound of this lane. */
  from: number;
  /** Upper ratio bound of this lane. */
  to: number;
  /** Top edge of the lane in a 0..1 (0 = band max, 1 = band min) viewport. */
  yTop: number;
  /** Bottom edge of the lane in the same 0..1 viewport. */
  yBottom: number;
  /** CSS fill token for the lane shade (cheap→up-soft … expensive→down-soft). */
  fill: string;
}

/** Projection of the current ratio onto the band, ready to render as a marker. */
export interface RiverMarker {
  /** The current ratio value. */
  value: number;
  /** Vertical position in the 0..1 viewport (0 = max at top, 1 = min at bottom). */
  y: number;
  /** Zone the current value falls into. */
  zone: "cheap" | "fair" | "expensive";
  /** CSS colour token for the marker per the valuation idiom. */
  color: string;
}

/** Full geometry for one river (PE or PB): lanes + optional current marker. */
export interface RiverGeometry {
  lanes: RiverLane[];
  marker: RiverMarker | null;
}

const LANE_DEFS: ReadonlyArray<{
  key: RiverLane["key"];
  label: string;
  fill: string;
}> = [
  { key: "p0_20", label: "便宜", fill: "var(--up-soft)" },
  { key: "p20_40", label: "偏低", fill: "var(--up-line)" },
  { key: "p40_60", label: "合理", fill: "var(--flat-soft)" },
  { key: "p60_80", label: "偏高", fill: "var(--down-line)" },
  { key: "p80_100", label: "昂貴", fill: "var(--down-soft)" },
];

/**
 * Project a ratio onto a 0..1 viewport where the band max sits at the top
 * (y=0) and the band min at the bottom (y=1) — higher valuation reads "up the
 * river". Values outside [min,max] clamp to the edges; a degenerate band
 * (max≤min) maps everything to the middle.
 */
export function projectY(value: number, min: number, max: number): number {
  if (!(max > min)) return 0.5;
  const t = (max - value) / (max - min);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * The valuation colour idiom: cheap=bullish→`--up`, expensive=bearish→`--down`,
 * fair→`--flat`. Centralised so the marker and any legend agree.
 */
export function zoneColor(zone: "cheap" | "fair" | "expensive"): string {
  return zone === "cheap"
    ? "var(--up)"
    : zone === "expensive"
      ? "var(--down)"
      : "var(--flat)";
}

/**
 * Build the full river geometry for one {@link ValuationBand}: five quantile
 * lanes spanning min→max plus the current-price marker (when `band.current` is
 * present). Returns `null` for a null band (cold-start) so the caller can show
 * the accumulating state instead of an empty chart.
 */
export function buildRiver(band: ValuationBand | null): RiverGeometry | null {
  if (band == null) return null;

  const { min, max, p20, p40, p60, p80 } = band;
  const cuts: number[] = [min, p20, p40, p60, p80, max];

  const lanes: RiverLane[] = LANE_DEFS.map((def, i) => {
    const from = cuts[i]!;
    const to = cuts[i + 1]!;
    return {
      key: def.key,
      label: def.label,
      from,
      to,
      // Lane top is the higher ratio (smaller y), bottom is the lower ratio.
      yTop: projectY(to, min, max),
      yBottom: projectY(from, min, max),
      fill: def.fill,
    };
  });

  const marker =
    band.current != null && band.zone != null
      ? {
          value: band.current,
          y: projectY(band.current, min, max),
          zone: band.zone,
          color: zoneColor(band.zone),
        }
      : null;

  return { lanes, marker };
}
