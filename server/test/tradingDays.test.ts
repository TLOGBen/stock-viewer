import { describe, expect, it } from "vitest";
import { recentTradingDays } from "../src/domain/index.js";

describe("domain/recentTradingDays", () => {
  it("returns `count` weekday tokens newest-first, including a weekday `now`", () => {
    // 2026-06-24 is a Wednesday.
    const days = recentTradingDays(new Date(Date.UTC(2026, 5, 24)), 3);
    expect(days).toEqual(["20260624", "20260623", "20260622"]); // Wed, Tue, Mon
  });

  it("skips weekends when walking back across a Monday", () => {
    // 2026-06-22 is a Monday → previous trading days are Fri 19, Thu 18.
    const days = recentTradingDays(new Date(Date.UTC(2026, 5, 22)), 3);
    expect(days).toEqual(["20260622", "20260619", "20260618"]);
  });

  it("anchors to the prior Friday when `now` is a weekend", () => {
    // 2026-06-27 is a Saturday → newest weekday token is Fri 26.
    const days = recentTradingDays(new Date(Date.UTC(2026, 5, 27)), 2);
    expect(days[0]).toBe("20260626");
    expect(days[1]).toBe("20260625");
  });

  it("count ≤ 0 → []", () => {
    expect(recentTradingDays(new Date(), 0)).toEqual([]);
    expect(recentTradingDays(new Date(), -5)).toEqual([]);
  });
});
