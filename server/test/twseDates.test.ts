import { describe, expect, it } from "vitest";

import { rocYYYMM, rocCnDate } from "../src/domain/twseDates.js";

describe("rocYYYMM — opendata packed 資料年月", () => {
  it("parses the canonical 5-digit form (115年5月 → 2026-05)", () => {
    expect(rocYYYMM("11505")).toEqual({ year: 2026, month: 5 });
  });

  it("parses December and a zero-padded older year", () => {
    expect(rocYYYMM("11512")).toEqual({ year: 2026, month: 12 });
    expect(rocYYYMM("09905")).toEqual({ year: 2010, month: 5 });
  });

  it("tolerates surrounding whitespace", () => {
    expect(rocYYYMM(" 11505 ")).toEqual({ year: 2026, month: 5 });
  });

  it("rejects malformed / out-of-range tokens with null", () => {
    expect(rocYYYMM("11500")).toBeNull(); // month 00
    expect(rocYYYMM("11513")).toBeNull(); // month 13
    expect(rocYYYMM("abc")).toBeNull();
    expect(rocYYYMM("115")).toBeNull(); // too short
    expect(rocYYYMM("")).toBeNull();
  });
});

describe("rocCnDate — rwd Chinese 資料日期", () => {
  it("parses '115年06月25日' to that day's UTC midnight epoch", () => {
    expect(rocCnDate("115年06月25日")).toBe(Date.UTC(2026, 5, 25));
  });

  it("tolerates unpadded month/day", () => {
    expect(rocCnDate("115年6月5日")).toBe(Date.UTC(2026, 5, 5));
  });

  it("rejects malformed / out-of-range tokens with NaN", () => {
    expect(rocCnDate("2026-06-25")).toBeNaN(); // wrong format
    expect(rocCnDate("115年13月25日")).toBeNaN(); // month 13
    expect(rocCnDate("115年06月32日")).toBeNaN(); // day 32
    expect(rocCnDate("")).toBeNaN();
  });
});
