import { describe, expect, it } from "vitest";

import { statsFromDaily } from "../src/domain/marketStats.js";
import type { Candle } from "../src/domain/types.js";

/** Build an ascending daily candle at day-index `i` with explicit OHLCV. */
const bar = (
  i: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): Candle => ({
  timestamp: i * 86_400_000,
  open,
  high,
  low,
  close,
  volume,
});

describe("statsFromDaily", () => {
  it("returns all-null stats for an empty series", () => {
    const stats = statsFromDaily("2330", []);
    expect(stats).toEqual({
      symbol: "2330",
      week52High: null,
      week52Low: null,
      avgVolume20: null,
      marketCap: null,
      amplitude: null,
    });
  });

  it("computes 52w high/low as max high / min low over the series", () => {
    const daily: Candle[] = [
      bar(0, 100, 110, 95, 105, 1000),
      bar(1, 105, 130, 100, 120, 1200), // high 130 is the max
      bar(2, 120, 125, 90, 115, 1100), // low 90 is the min
    ];
    const stats = statsFromDaily("2330", daily);
    expect(stats.week52High).toBe(130);
    expect(stats.week52Low).toBe(90);
  });

  it("averages the last 20 days of volume (張)", () => {
    // 25 days; only the last 20 (volumes 6..25) count.
    const daily: Candle[] = Array.from({ length: 25 }, (_, i) =>
      bar(i, 100, 100, 100, 100, i + 1),
    );
    const stats = statsFromDaily("2330", daily);
    // Volumes of last 20 days = 6,7,...,25 → sum = (6+25)*20/2 = 310, mean 15.5.
    expect(stats.avgVolume20).toBeCloseTo(15.5, 10);
  });

  it("averages over all sessions when fewer than 20 exist", () => {
    const daily: Candle[] = [
      bar(0, 100, 100, 100, 100, 10),
      bar(1, 100, 100, 100, 100, 20),
      bar(2, 100, 100, 100, 100, 30),
    ];
    const stats = statsFromDaily("2330", daily);
    expect(stats.avgVolume20).toBeCloseTo(20, 10);
  });

  it("computes amplitude as last (high-low)/prevDayClose * 100", () => {
    const daily: Candle[] = [
      bar(0, 100, 110, 95, 100, 1000), // prev close = 100
      bar(1, 102, 108, 98, 104, 1100), // range = 10 → 10/100*100 = 10
    ];
    const stats = statsFromDaily("2330", daily);
    expect(stats.amplitude).toBeCloseTo(10, 10);
  });

  it("leaves amplitude null with a single day (no prior close)", () => {
    const stats = statsFromDaily("2330", [bar(0, 100, 110, 95, 105, 1000)]);
    expect(stats.amplitude).toBeNull();
  });

  it("leaves amplitude null when the prior close is zero", () => {
    const daily: Candle[] = [
      bar(0, 0, 0, 0, 0, 1000),
      bar(1, 102, 108, 98, 104, 1100),
    ];
    expect(statsFromDaily("2330", daily).amplitude).toBeNull();
  });

  it("never fabricates a market cap", () => {
    const stats = statsFromDaily("2330", [bar(0, 100, 110, 95, 105, 1000)]);
    expect(stats.marketCap).toBeNull();
  });

  it("caps the 52-week window at ~252 trailing sessions", () => {
    // Day 0 carries an extreme high/low that must fall outside the 252 window.
    const daily: Candle[] = [
      bar(0, 100, 9999, 1, 100, 1000),
      ...Array.from({ length: 252 }, (_, i) =>
        bar(i + 1, 100, 110, 90, 100, 1000),
      ),
    ];
    const stats = statsFromDaily("2330", daily);
    // 253 bars total; window is the last 252 → the extreme day 0 is excluded.
    expect(stats.week52High).toBe(110);
    expect(stats.week52Low).toBe(90);
  });
});
