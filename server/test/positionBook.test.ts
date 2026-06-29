import { describe, it, expect } from "vitest";
import {
  normalizePositionBook,
  emptyBook,
  DEFAULT_CASH,
} from "../src/domain/index.js";

describe("normalizePositionBook — trust boundary for disk + PUT body", () => {
  it("passes through a valid book unchanged", () => {
    const raw = {
      positions: {
        "2330": { symbol: "2330", lots: 2, avgPrice: 1000, realized: 5000 },
      },
      cashBalance: 8_000_000,
    };
    expect(normalizePositionBook(raw)).toEqual(raw);
  });

  it("drops positions with missing/non-finite numeric fields", () => {
    const book = normalizePositionBook({
      positions: {
        good: { symbol: "good", lots: 1, avgPrice: 10, realized: 0 },
        noLots: { symbol: "noLots", avgPrice: 10, realized: 0 },
        nanPrice: { symbol: "nanPrice", lots: 1, avgPrice: "x", realized: 0 },
        notObj: 42,
      },
      cashBalance: 1_000,
    });
    expect(Object.keys(book.positions)).toEqual(["good"]);
    expect(book.cashBalance).toBe(1_000);
  });

  it("falls back to DEFAULT_CASH for negative / non-finite / missing cash", () => {
    expect(normalizePositionBook({ positions: {}, cashBalance: -1 }).cashBalance).toBe(
      DEFAULT_CASH,
    );
    expect(
      normalizePositionBook({ positions: {}, cashBalance: Number.NaN }).cashBalance,
    ).toBe(DEFAULT_CASH);
    expect(normalizePositionBook({ positions: {} }).cashBalance).toBe(DEFAULT_CASH);
  });

  it("allows a zero cash balance (fully invested)", () => {
    expect(normalizePositionBook({ positions: {}, cashBalance: 0 }).cashBalance).toBe(0);
  });

  it("degrades non-object / null input to an empty book", () => {
    expect(normalizePositionBook(null)).toEqual(emptyBook());
    expect(normalizePositionBook("nope")).toEqual(emptyBook());
    expect(normalizePositionBook(undefined)).toEqual(emptyBook());
  });
});
