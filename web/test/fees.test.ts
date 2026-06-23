import { describe, it, expect } from "vitest";
import { computeFees, type FeeBreakdown } from "../utils/fees";
import { SHARES_PER_LOT } from "../types";

describe("computeFees — commission", () => {
  it("floors commission at the 20 TWD minimum for tiny orders", () => {
    // 1 share at 10 → gross 10, raw commission = 10*0.001425*0.6 ≈ 0.009 → floored to 20.
    const fee = computeFees({
      side: "buy",
      price: 10,
      lots: 1,
      unit: "share",
    });
    expect(fee.commission).toBe(20);
  });

  it("applies the broker discount (default 0.6)", () => {
    // 1 lot @ 500 → gross 500_000. comm = round(500000*0.001425*0.6) = round(427.5) = 428.
    const fee = computeFees({ side: "buy", price: 500, lots: 1 });
    expect(fee.gross).toBe(500 * SHARES_PER_LOT);
    expect(fee.commission).toBe(428);
  });

  it("honors a custom discount", () => {
    // feeDiscount 1.0 → comm = round(500000*0.001425) = round(712.5) = 713.
    const fee = computeFees({
      side: "buy",
      price: 500,
      lots: 1,
      feeDiscount: 1,
    });
    expect(fee.commission).toBe(713);
  });

  it("charges commission on BOTH buy and sell legs", () => {
    const buy = computeFees({ side: "buy", price: 500, lots: 1 });
    const sell = computeFees({ side: "sell", price: 500, lots: 1 });
    expect(buy.commission).toBe(428);
    expect(sell.commission).toBe(428);
    expect(buy.commission).toBe(sell.commission);
  });
});

describe("computeFees — tax", () => {
  it("charges 0.3% sell tax on a stock", () => {
    // gross 500_000 → tax = round(500000*0.003) = 1500.
    const fee = computeFees({ side: "sell", price: 500, lots: 1 });
    expect(fee.tax).toBe(1500);
  });

  it("charges only 0.1% sell tax on an ETF", () => {
    // gross 500_000 → tax = round(500000*0.001) = 500.
    const fee = computeFees({ side: "sell", price: 500, lots: 1, isEtf: true });
    expect(fee.tax).toBe(500);
  });

  it("charges no tax on a buy (stock or ETF)", () => {
    expect(computeFees({ side: "buy", price: 500, lots: 1 }).tax).toBe(0);
    expect(
      computeFees({ side: "buy", price: 500, lots: 1, isEtf: true }).tax,
    ).toBe(0);
  });
});

describe("computeFees — net signs", () => {
  it("buy net = gross + commission", () => {
    const fee = computeFees({ side: "buy", price: 500, lots: 1 });
    expect(fee.net).toBe(fee.gross + fee.commission);
    expect(fee.net).toBe(500_000 + 428);
  });

  it("sell net = gross - commission - tax", () => {
    const fee = computeFees({ side: "sell", price: 500, lots: 1 });
    expect(fee.net).toBe(fee.gross - fee.commission - fee.tax);
    expect(fee.net).toBe(500_000 - 428 - 1500);
  });
});

describe("computeFees — quantity unit", () => {
  it("treats lots as 張 (×1000) by default", () => {
    const lot = computeFees({ side: "buy", price: 100, lots: 2 });
    expect(lot.gross).toBe(100 * 2 * SHARES_PER_LOT);
  });

  it("treats lots as raw 股 when unit=share", () => {
    const share = computeFees({
      side: "buy",
      price: 100,
      lots: 2,
      unit: "share",
    });
    expect(share.gross).toBe(100 * 2);
  });

  it("1 lot and 1000 shares produce the same breakdown", () => {
    const lot = computeFees({ side: "sell", price: 50, lots: 1, unit: "lot" });
    const share = computeFees({
      side: "sell",
      price: 50,
      lots: SHARES_PER_LOT,
      unit: "share",
    });
    expect(share).toEqual<FeeBreakdown>(lot);
  });
});

describe("computeFees — guards", () => {
  it("returns a zero breakdown for non-positive price", () => {
    expect(computeFees({ side: "buy", price: 0, lots: 1 })).toEqual<FeeBreakdown>(
      { gross: 0, commission: 0, tax: 0, net: 0 },
    );
  });

  it("returns a zero breakdown for non-finite / zero quantity", () => {
    expect(
      computeFees({ side: "buy", price: 100, lots: 0 }),
    ).toEqual<FeeBreakdown>({ gross: 0, commission: 0, tax: 0, net: 0 });
  });
});
