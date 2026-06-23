/**
 * Pure, unit-testable transforms bridging our frozen `Candle`/`KlineChartType`
 * to KLineChart's data + candle-type model. No DOM, no Vue, no side effects.
 */
import type { Candle, KlineChartType } from "~/types";

/**
 * KLineChart's `candle.type` string union (mirror of the library's `CandleType`
 * enum values). We map our 6 UI chart types onto these 4 native renderers.
 */
export type KlineCandleType =
  | "candle_solid"
  | "candle_stroke"
  | "ohlc"
  | "area";

/**
 * Map our UI `KlineChartType` to KLineChart's native `candle.type`.
 *
 * - candle_solid / candle_stroke / ohlc / area → 1:1
 * - line              → area (KLineChart has no pure line type; area renders the
 *                        close-price line; the fill is dropped via styles)
 * - heikin_ashi       → candle_solid, but the *data* must be pre-transformed via
 *                        `toHeikinAshi` before `applyNewData`
 */
export function chartTypeToCandleType(
  chartType: KlineChartType,
): KlineCandleType {
  switch (chartType) {
    case "candle_solid":
      return "candle_solid";
    case "candle_stroke":
      return "candle_stroke";
    case "ohlc":
      return "ohlc";
    case "area":
      return "area";
    case "line":
      // No pure line type in KLineChart v9 — use area; the component drops the
      // fill so it reads as a plain line.
      return "area";
    case "heikin_ashi":
      // Rendered as solid candles over Heikin-Ashi-transformed data.
      return "candle_solid";
  }
}

/**
 * `true` when the given chart type renders an area (so the caller can decide to
 * hide the area fill for the pseudo "line" mode).
 */
export function isLineMode(chartType: KlineChartType): boolean {
  return chartType === "line";
}

/**
 * Pure Heikin-Ashi transform. Returns a NEW array of new Candle objects;
 * inputs are never mutated. Volume/timestamp are carried through unchanged.
 *
 *   HA close = (open + high + low + close) / 4
 *   HA open  = (prev HA open + prev HA close) / 2   (seed: (open + close) / 2)
 *   HA high  = max(high, HA open, HA close)
 *   HA low   = min(low,  HA open, HA close)
 */
export function toHeikinAshi(candles: readonly Candle[]): Candle[] {
  const out: Candle[] = [];
  let prevHaOpen = 0;
  let prevHaClose = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (c === undefined) continue;

    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen =
      i === 0 ? (c.open + c.close) / 2 : (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);

    out.push({
      timestamp: c.timestamp,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume,
    });

    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }

  return out;
}
