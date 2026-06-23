import { describe, it, expect } from "vitest";
import { toHeikinAshi, chartTypeToCandleType } from "../utils/klineTransform";
import type { Candle, KlineChartType } from "~/types";

/**
 * A small, hand-checkable OHLC series. Volume is carried through untouched.
 *
 * Heikin-Ashi definitions (the PINNED behavior):
 *   haClose = (open + high + low + close) / 4
 *   haOpen[0] = (open[0] + close[0]) / 2                  (seed bar)
 *   haOpen[i] = (haOpen[i-1] + haClose[i-1]) / 2          (i > 0)
 *   haHigh = max(high, haOpen, haClose)
 *   haLow  = min(low,  haOpen, haClose)
 */
const series: Candle[] = [
  { timestamp: 1, open: 10, high: 14, low: 9, close: 13, volume: 100 },
  { timestamp: 2, open: 13, high: 16, low: 12, close: 15, volume: 200 },
  { timestamp: 3, open: 15, high: 15, low: 8, close: 9, volume: 300 },
];

describe("toHeikinAshi", () => {
  it("returns an empty array for empty input", () => {
    expect(toHeikinAshi([])).toEqual([]);
  });

  it("does not mutate the input array or its candles", () => {
    const input: Candle[] = [
      { timestamp: 1, open: 10, high: 14, low: 9, close: 13, volume: 100 },
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    toHeikinAshi(input);
    expect(input).toEqual(snapshot);
  });

  it("seeds the first bar: haOpen = (open+close)/2, haClose = avg of 4", () => {
    const [first] = toHeikinAshi(series);
    // haClose = (10 + 14 + 9 + 13) / 4 = 11.5
    expect(first!.close).toBeCloseTo(11.5, 10);
    // haOpen = (10 + 13) / 2 = 11.5
    expect(first!.open).toBeCloseTo(11.5, 10);
    // haHigh = max(14, 11.5, 11.5) = 14 ; haLow = min(9, 11.5, 11.5) = 9
    expect(first!.high).toBeCloseTo(14, 10);
    expect(first!.low).toBeCloseTo(9, 10);
  });

  it("derives subsequent haOpen from the previous HA bar", () => {
    const ha = toHeikinAshi(series);

    // Bar 0: haOpen=11.5, haClose=11.5
    // Bar 1: haClose = (13 + 16 + 12 + 15) / 4 = 14
    //        haOpen  = (11.5 + 11.5) / 2 = 11.5
    //        haHigh  = max(16, 11.5, 14) = 16
    //        haLow   = min(12, 11.5, 14) = 11.5
    const b1 = ha[1]!;
    expect(b1.close).toBeCloseTo(14, 10);
    expect(b1.open).toBeCloseTo(11.5, 10);
    expect(b1.high).toBeCloseTo(16, 10);
    expect(b1.low).toBeCloseTo(11.5, 10);

    // Bar 2: haClose = (15 + 15 + 8 + 9) / 4 = 11.75
    //        haOpen  = (11.5 + 14) / 2 = 12.75
    //        haHigh  = max(15, 12.75, 11.75) = 15
    //        haLow   = min(8, 12.75, 11.75) = 8
    const b2 = ha[2]!;
    expect(b2.close).toBeCloseTo(11.75, 10);
    expect(b2.open).toBeCloseTo(12.75, 10);
    expect(b2.high).toBeCloseTo(15, 10);
    expect(b2.low).toBeCloseTo(8, 10);
  });

  it("includes haOpen and haClose in the high/low envelope", () => {
    // A bar whose HA body extends beyond the raw high/low.
    const bumpy: Candle[] = [
      { timestamp: 1, open: 100, high: 101, low: 99, close: 100, volume: 10 },
      // raw high 90 < prior HA values → haOpen/haClose should lift haHigh
      { timestamp: 2, open: 80, high: 90, low: 70, close: 75, volume: 10 },
    ];
    const ha = toHeikinAshi(bumpy);
    const bar = ha[1]!;
    // haHigh must be >= max(raw high, haOpen, haClose)
    expect(bar.high).toBeGreaterThanOrEqual(bar.open);
    expect(bar.high).toBeGreaterThanOrEqual(bar.close);
    expect(bar.high).toBeGreaterThanOrEqual(90);
    // haLow must be <= min(raw low, haOpen, haClose)
    expect(bar.low).toBeLessThanOrEqual(bar.open);
    expect(bar.low).toBeLessThanOrEqual(bar.close);
    expect(bar.low).toBeLessThanOrEqual(70);
  });

  it("preserves timestamp and volume for every bar", () => {
    const ha = toHeikinAshi(series);
    expect(ha).toHaveLength(series.length);
    ha.forEach((bar, i) => {
      expect(bar.timestamp).toBe(series[i]!.timestamp);
      expect(bar.volume).toBe(series[i]!.volume);
    });
  });
});

describe("chartTypeToCandleType", () => {
  it("passes through the native klinecharts candle types", () => {
    expect(chartTypeToCandleType("candle_solid")).toBe("candle_solid");
    expect(chartTypeToCandleType("candle_stroke")).toBe("candle_stroke");
    expect(chartTypeToCandleType("area")).toBe("area");
    expect(chartTypeToCandleType("ohlc")).toBe("ohlc");
  });

  it("maps line to the area candle type (klinecharts has no line type)", () => {
    expect(chartTypeToCandleType("line")).toBe("area");
  });

  it("maps heikin_ashi to candle_solid (HA is achieved via data transform)", () => {
    expect(chartTypeToCandleType("heikin_ashi")).toBe("candle_solid");
  });

  it("only ever yields valid klinecharts CandleType values", () => {
    const valid = new Set(["candle_solid", "candle_stroke", "ohlc", "area"]);
    const all: KlineChartType[] = [
      "candle_solid",
      "candle_stroke",
      "area",
      "line",
      "ohlc",
      "heikin_ashi",
    ];
    for (const t of all) {
      expect(valid.has(chartTypeToCandleType(t))).toBe(true);
    }
  });
});
