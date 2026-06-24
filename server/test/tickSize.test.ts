import { describe, expect, it } from "vitest";

import { tickSizeFor, decimalsFor, roundToTick } from "../src/domain/tickSize.js";

describe("tickSizeFor — stock ladder boundaries", () => {
  // [price, expected step, expected decimals]
  const cases: ReadonlyArray<readonly [number, number, number]> = [
    [9.99, 0.01, 2],
    [10, 0.05, 2],
    [49.95, 0.05, 2],
    [50, 0.1, 1],
    [99.9, 0.1, 1],
    [100, 0.5, 1],
    [499.5, 0.5, 1],
    [500, 1, 0],
    [999, 1, 0],
    [1000, 5, 0],
  ];

  for (const [price, step, decimals] of cases) {
    it(`price ${price} → step ${step}, decimals ${decimals}`, () => {
      const info = tickSizeFor(price, "stock");
      expect(info.step).toBe(step);
      expect(info.decimals).toBe(decimals);
      expect(decimalsFor(price, "stock")).toBe(decimals);
    });
  }

  it("defaults kind to stock", () => {
    expect(tickSizeFor(9.99)).toEqual({ step: 0.01, decimals: 2 });
    expect(tickSizeFor(1000)).toEqual({ step: 5, decimals: 0 });
  });
});

describe("tickSizeFor — ETF ladder boundaries", () => {
  it("below 50 → step 0.01, decimals 2", () => {
    expect(tickSizeFor(49.99, "etf")).toEqual({ step: 0.01, decimals: 2 });
    expect(tickSizeFor(10, "etf")).toEqual({ step: 0.01, decimals: 2 });
    expect(tickSizeFor(0.5, "etf")).toEqual({ step: 0.01, decimals: 2 });
  });

  it("at/above 50 → step 0.05, decimals 2", () => {
    expect(tickSizeFor(50, "etf")).toEqual({ step: 0.05, decimals: 2 });
    expect(tickSizeFor(500, "etf")).toEqual({ step: 0.05, decimals: 2 });
    expect(tickSizeFor(9999, "etf")).toEqual({ step: 0.05, decimals: 2 });
  });
});

describe("roundToTick — snaps to a legal tick", () => {
  it("snaps stock prices to the nearest legal increment", () => {
    // <10 → 0.01 step.
    expect(roundToTick(9.991, "stock")).toBe(9.99);
    // [50,100) → 0.1 step: 50.04 nearest is 50.0.
    expect(roundToTick(50.04, "stock")).toBe(50);
    // [50,100) → 0.1 step: 50.06 nearest is 50.1.
    expect(roundToTick(50.06, "stock")).toBe(50.1);
    // [100,500) → 0.5 step: 123.3 nearest legal is 123.5.
    expect(roundToTick(123.3, "stock")).toBe(123.5);
    // [500,1000) → 1 step.
    expect(roundToTick(500.4, "stock")).toBe(500);
    // >=1000 → 5 step: 1003 nearest is 1005.
    expect(roundToTick(1003, "stock")).toBe(1005);
  });

  it("respects up/down sides", () => {
    // [100,500) → 0.5 step.
    expect(roundToTick(123.1, "stock", "up")).toBe(123.5);
    expect(roundToTick(123.4, "stock", "down")).toBe(123);
  });

  it("snaps ETF prices to the ETF ladder", () => {
    // <50 → 0.01 step.
    expect(roundToTick(49.991, "etf")).toBe(49.99);
    // >=50 → 0.05 step: 50.04 nearest legal is 50.05.
    expect(roundToTick(50.04, "etf")).toBe(50.05);
  });

  it("passes through non-finite input unchanged", () => {
    expect(roundToTick(NaN, "stock")).toBeNaN();
    expect(roundToTick(Infinity, "stock")).toBe(Infinity);
  });
});
