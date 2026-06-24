import { describe, expect, it } from "vitest";

import { CandleStore } from "../src/persistence/candleStore.js";
import type { Candle } from "../src/domain/index.js";

/** Bar-open epoch ms for a given minute index (minute 0 = epoch 0). */
const minute = (m: number): number => m * 60_000;

describe("CandleStore.ingestTick — 1m OHLC", () => {
  it("builds correct OHLC across a single minute then closes at the boundary", () => {
    const store = new CandleStore();
    const sym = "2330";

    // Minute 0: four ticks. cumulativeVolume is the DAILY running total.
    // open=100, high=105, low=98, close=102.
    store.ingestTick(sym, 100, 1000, minute(0) + 1_000); // first tick, baseline
    store.ingestTick(sym, 105, 1010, minute(0) + 10_000); // +10 lots
    store.ingestTick(sym, 98, 1015, minute(0) + 20_000); // +5 lots
    const lastM0 = store.ingestTick(sym, 102, 1020, minute(0) + 50_000); // +5 lots

    // No boundary crossed yet → exactly one 1m update (forming, not closed).
    const m0Forming = lastM0.filter((u) => u.interval === "1m");
    expect(m0Forming).toHaveLength(1);
    expect(m0Forming[0]!.closed).toBe(false);
    const formingBar = m0Forming[0]!.candle;
    expect(formingBar.timestamp).toBe(minute(0));
    expect(formingBar.open).toBe(100);
    expect(formingBar.high).toBe(105);
    expect(formingBar.low).toBe(98);
    expect(formingBar.close).toBe(102);
    // Volume = SUM OF DELTAS: 0 (baseline) + 10 + 5 + 5 = 20, NOT cumulative 1020.
    expect(formingBar.volume).toBe(20);
  });

  it("emits closed-then-new at the minute boundary with correct open/close transition", () => {
    const store = new CandleStore();
    const sym = "2330";

    store.ingestTick(sym, 100, 1000, minute(0) + 1_000); // baseline
    store.ingestTick(sym, 110, 1030, minute(0) + 30_000); // +30 lots → minute 0 close=110

    // First tick of minute 1 crosses the boundary.
    const crossing = store.ingestTick(sym, 120, 1045, minute(1) + 5_000); // +15 lots
    const m1 = crossing.filter((u) => u.interval === "1m");

    // Two updates: the just-closed minute-0 bar, then the new forming minute-1 bar.
    expect(m1).toHaveLength(2);

    const closed = m1[0]!;
    expect(closed.closed).toBe(true);
    expect(closed.candle.timestamp).toBe(minute(0));
    expect(closed.candle.open).toBe(100);
    expect(closed.candle.close).toBe(110);
    expect(closed.candle.high).toBe(110);
    expect(closed.candle.low).toBe(100);
    // minute-0 volume = 0 + 30 = 30.
    expect(closed.candle.volume).toBe(30);

    const opened = m1[1]!;
    expect(opened.closed).toBe(false);
    expect(opened.candle.timestamp).toBe(minute(1));
    expect(opened.candle.open).toBe(120);
    expect(opened.candle.high).toBe(120);
    expect(opened.candle.low).toBe(120);
    expect(opened.candle.close).toBe(120);
    // New bar's volume = the delta carried by THIS crossing tick: 1045-1030 = 15.
    expect(opened.candle.volume).toBe(15);
  });

  it("accumulates bar volume as the sum of cumulative-volume deltas, never the cumulative", () => {
    const store = new CandleStore();
    const sym = "1101";

    // Rising cumulative volume across minute 0 and into minute 1.
    store.ingestTick(sym, 50, 5000, minute(0) + 1_000); // baseline (delta 0)
    store.ingestTick(sym, 51, 5100, minute(0) + 10_000); // +100
    store.ingestTick(sym, 52, 5250, minute(0) + 40_000); // +150
    // minute 0 should hold 0 + 100 + 150 = 250 lots.

    const cross = store.ingestTick(sym, 53, 5400, minute(1) + 1_000); // +150 (into m1)
    const closed = cross.find((u) => u.interval === "1m" && u.closed);
    expect(closed?.candle.volume).toBe(250);

    store.ingestTick(sym, 54, 5500, minute(1) + 20_000); // +100 in m1
    const bars = store.getIntraday(sym, "1m", 300);
    // [minute0 closed, minute1 forming]
    expect(bars).toHaveLength(2);
    const m1Forming = bars[1]!;
    expect(m1Forming.timestamp).toBe(minute(1));
    // m1 volume = 150 (crossing tick) + 100 = 250, NOT cumulative 5500.
    expect(m1Forming.volume).toBe(250);
  });
});

describe("CandleStore.ingestTick — multi-interval rollover", () => {
  it("rolls 1m every minute but keeps 5m forming until the 5-minute boundary", () => {
    const store = new CandleStore();
    const sym = "2317";

    // Ticks at minutes 0..5; cumulative volume rises by 10 lots each tick.
    let cum = 0;
    for (let m = 0; m <= 4; m++) {
      cum += 10;
      store.ingestTick(sym, 100 + m, cum, minute(m) + 1_000);
    }
    // Still inside 5m bar [0,5). One forming 5m bar, no closed 5m yet.
    expect(store.getIntraday(sym, "5m", 300)).toHaveLength(1);
    // 1m has closed bars for minutes 0..3 plus forming minute 4 = 5 bars.
    expect(store.getIntraday(sym, "1m", 300)).toHaveLength(5);

    // Tick at minute 5 crosses the 5m boundary.
    cum += 10;
    const u = store.ingestTick(sym, 110, cum, minute(5) + 1_000);
    const fiveMin = u.filter((x) => x.interval === "5m");
    expect(fiveMin).toHaveLength(2);
    expect(fiveMin[0]!.closed).toBe(true);
    expect(fiveMin[0]!.candle.timestamp).toBe(minute(0));
    expect(fiveMin[1]!.closed).toBe(false);
    expect(fiveMin[1]!.candle.timestamp).toBe(minute(5));
  });
});

describe("CandleStore.ingestTick — guards", () => {
  it("skips ticks with non-finite price or cumulativeVolume", () => {
    const store = new CandleStore();
    const sym = "2330";
    expect(store.ingestTick(sym, NaN, 1000, minute(0))).toEqual([]);
    expect(store.ingestTick(sym, 100, Infinity, minute(0))).toEqual([]);
    expect(store.ingestTick(sym, 100, NaN, minute(0))).toEqual([]);
    // Nothing ingested → no series.
    expect(store.getIntraday(sym, "1m", 300)).toEqual([]);
  });
});

describe("CandleStore.getIntraday — ordering and limit", () => {
  it("returns bars ascending by timestamp, closed bars then forming", () => {
    const store = new CandleStore();
    const sym = "2454";
    for (let m = 0; m < 4; m++) {
      store.ingestTick(sym, 100 + m, (m + 1) * 100, minute(m) + 1_000);
    }
    const bars = store.getIntraday(sym, "1m", 300);
    // minutes 0,1,2 closed + minute 3 forming.
    expect(bars).toHaveLength(4);
    const timestamps = bars.map((b: Candle) => b.timestamp);
    expect(timestamps).toEqual([minute(0), minute(1), minute(2), minute(3)]);
    // Sorted ascending.
    const sorted = [...timestamps].sort((a, b) => a - b);
    expect(timestamps).toEqual(sorted);
  });

  it("honors the limit by returning only the last N bars", () => {
    const store = new CandleStore();
    const sym = "3008";
    for (let m = 0; m < 10; m++) {
      store.ingestTick(sym, 100 + m, (m + 1) * 100, minute(m) + 1_000);
    }
    const last3 = store.getIntraday(sym, "1m", 3);
    expect(last3).toHaveLength(3);
    expect(last3.map((b: Candle) => b.timestamp)).toEqual([
      minute(7),
      minute(8),
      minute(9),
    ]);
  });

  it("returns an empty array for an unknown symbol/interval", () => {
    const store = new CandleStore();
    expect(store.getIntraday("9999", "15m", 300)).toEqual([]);
  });
});
