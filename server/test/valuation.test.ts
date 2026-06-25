import { describe, expect, it } from "vitest";

import { parseBwibbuRow, bandFromSeries } from "../src/domain/valuation.js";

describe("parseBwibbuRow — BWIBBU_ALL PE/PB/殖利率", () => {
  it("maps the real 1513 row (PE 22.48, PB 4.25, yield 3.24%)", () => {
    const r = parseBwibbuRow({
      Date: "1150624",
      Code: "1513",
      Name: "中興電",
      PEratio: "22.48",
      DividendYield: "3.24",
      PBratio: "4.25",
    });
    expect(r).toEqual({
      date: "1150624",
      pe: 22.48,
      pb: 4.25,
      dividendYieldPct: 3.24,
    });
  });

  it("maps an empty PEratio (e.g. 台泥, no positive EPS) to null", () => {
    const r = parseBwibbuRow({ Date: "1150624", PEratio: "", PBratio: "1.1", DividendYield: "5" });
    expect(r.pe).toBeNull();
    expect(r.pb).toBe(1.1);
  });
});

describe("bandFromSeries — PE/PB river quantile band", () => {
  it("computes quantile lines and places current in the cheap zone", () => {
    const xs = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
    const band = bandFromSeries(xs, 11);
    expect(band?.count).toBe(10);
    expect(band?.min).toBe(10);
    expect(band?.max).toBe(28);
    expect(band?.zone).toBe("cheap"); // 11 ≤ p20
  });

  it("flags an expensive current and a fair middle", () => {
    const xs = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
    expect(bandFromSeries(xs, 27)?.zone).toBe("expensive");
    expect(bandFromSeries(xs, 19)?.zone).toBe("fair");
  });

  it("drops null/non-finite points and returns null for an empty series", () => {
    expect(bandFromSeries([null, NaN, null], 5)).toBeNull();
    const band = bandFromSeries([null, 10, 20, NaN], null);
    expect(band?.count).toBe(2);
    expect(band?.zone).toBeNull(); // no current
  });
});
