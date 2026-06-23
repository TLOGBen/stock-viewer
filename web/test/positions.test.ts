import { describe, it, expect } from "vitest";
import {
  applyOrder,
  closeAtPrice,
  unrealizedPnl,
  totalUnrealized,
  totalRealized,
} from "../utils/positions";
import { SHARES_PER_LOT } from "../types";
import type { Position, OrderRequest, Quote } from "../types";

function buy(symbol: string, price: number, lots: number): OrderRequest {
  return { symbol, side: "buy", lots, price };
}

function sell(symbol: string, price: number, lots: number): OrderRequest {
  return { symbol, side: "sell", lots, price };
}

/** Minimal Quote stub carrying only the fields the math reads (price). */
function quoteWith(symbol: string, price: number | null): Quote {
  return {
    symbol,
    exch: "tse",
    name: symbol,
    fullName: symbol,
    price,
    prevClose: 0,
    open: null,
    high: null,
    low: null,
    limitUp: null,
    limitDown: null,
    volume: 0,
    lastVolume: 0,
    change: 0,
    changePercent: 0,
    direction: "flat",
    tick: "flat",
    bids: [],
    asks: [],
    time: "00:00:00",
    tlong: 0,
    updatedAt: 0,
  };
}

function get(
  positions: Record<string, Position>,
  symbol: string,
): Position {
  const p = positions[symbol];
  if (!p) throw new Error(`expected position for ${symbol}`);
  return p;
}

describe("applyOrder — 張/股 unit (零股)", () => {
  it("books a 股 (share) order as fractional 張, not 1000× too large", () => {
    // 500 股 of 2330 @100 = 0.5 張. Without unit-awareness this would book 500 張.
    const order: OrderRequest = {
      symbol: "2330",
      side: "buy",
      lots: 500,
      price: 100,
      unit: "share",
    };
    const book = applyOrder({}, order);
    const pos = get(book, "2330");
    expect(pos.lots).toBe(0.5);
    expect(pos.avgPrice).toBe(100);
    // unrealized P&L at 110 = (110-100) * 0.5 lots * 1000 shares = 5000.
    expect(unrealizedPnl(pos, 110)).toBe(5000);
  });

  it("a lot-unit order is unchanged (back-compat)", () => {
    const book = applyOrder({}, buy("2330", 100, 2)); // unit omitted -> 張
    expect(get(book, "2330").lots).toBe(2);
  });
});

describe("applyOrder — open and add", () => {
  it("opens a long: buy 2330 @100 x2 -> lots 2, avg 100", () => {
    const book = applyOrder({}, buy("2330", 100, 2));
    const pos = get(book, "2330");
    expect(pos.lots).toBe(2);
    expect(pos.avgPrice).toBe(100);
    expect(pos.realized).toBe(0);
  });

  it("unrealized @110 on 2 lots = (110-100)*2*1000 = 20000", () => {
    const book = applyOrder({}, buy("2330", 100, 2));
    expect(unrealizedPnl(get(book, "2330"), 110)).toBe(20000);
    expect(unrealizedPnl(get(book, "2330"), 110)).toBe(
      (110 - 100) * 2 * SHARES_PER_LOT,
    );
  });

  it("adds in the same direction -> weighted avg: buy @120 x2 -> lots 4, avg 110", () => {
    let book = applyOrder({}, buy("2330", 100, 2));
    book = applyOrder(book, buy("2330", 120, 2));
    const pos = get(book, "2330");
    expect(pos.lots).toBe(4);
    expect(pos.avgPrice).toBe(110);
    expect(pos.realized).toBe(0);
  });
});

describe("applyOrder — reduce books realized", () => {
  it("sell @130 x2 against lots 4 avg 110 -> lots 2, realized (130-110)*2*1000 = 40000", () => {
    let book = applyOrder({}, buy("2330", 100, 2));
    book = applyOrder(book, buy("2330", 120, 2));
    book = applyOrder(book, sell("2330", 130, 2));
    const pos = get(book, "2330");
    expect(pos.lots).toBe(2);
    expect(pos.avgPrice).toBe(110); // entry preserved on partial reduction
    expect(pos.realized).toBe(40000);
    expect(pos.realized).toBe((130 - 110) * 2 * SHARES_PER_LOT);
  });
});

describe("closeAtPrice — flatten and book realized", () => {
  it("closes remaining 2 lots @130 -> lots 0, realized cumulative includes (130-110)*2*1000", () => {
    let book = applyOrder({}, buy("2330", 100, 2));
    book = applyOrder(book, buy("2330", 120, 2));
    book = applyOrder(book, sell("2330", 130, 2)); // realized 40000, lots 2 avg 110
    book = closeAtPrice(book, "2330", 130);
    const pos = get(book, "2330");
    expect(pos.lots).toBe(0);
    // prior 40000 + this close (130-110)*2*1000 = 40000 -> 80000
    expect(pos.realized).toBe(80000);
    expect(pos.realized).toBe(40000 + (130 - 110) * 2 * SHARES_PER_LOT);
  });
});

describe("totalUnrealized / totalRealized — aggregate across symbols", () => {
  it("sums unrealized using a quotes record and realized across the book", () => {
    let book: Record<string, Position> = {};
    book = applyOrder(book, buy("2330", 100, 2)); // long 2 @100
    book = applyOrder(book, buy("2317", 50, 4)); // long 4 @50
    book = applyOrder(book, sell("2317", 60, 1)); // realized (60-50)*1*1000 = 10000 on 2317

    const quotes: Record<string, Quote> = {
      "2330": quoteWith("2330", 110), // (110-100)*2*1000 = 20000
      "2317": quoteWith("2317", 55), // (55-50)*3*1000 = 15000
    };

    expect(totalUnrealized(book, quotes)).toBe(20000 + 15000);
    expect(totalRealized(book)).toBe(10000);
  });

  it("treats a missing or null quote price as zero unrealized for that symbol", () => {
    let book: Record<string, Position> = {};
    book = applyOrder(book, buy("2330", 100, 2));
    book = applyOrder(book, buy("2317", 50, 4));

    const quotes: Record<string, Quote> = {
      "2330": quoteWith("2330", 110), // 20000
      "2317": quoteWith("2317", null), // 0
    };

    expect(totalUnrealized(book, quotes)).toBe(20000);
  });
});

describe("applyOrder — flip past zero", () => {
  it("long 1 @100, sell 3 @120 -> short 2 avg 120, realized (120-100)*1*1000 = 20000", () => {
    let book = applyOrder({}, buy("2330", 100, 1));
    book = applyOrder(book, sell("2330", 120, 3));
    const pos = get(book, "2330");
    expect(pos.lots).toBe(-2);
    expect(pos.avgPrice).toBe(120);
    expect(pos.realized).toBe(20000);
    expect(pos.realized).toBe((120 - 100) * 1 * SHARES_PER_LOT);
  });
});
