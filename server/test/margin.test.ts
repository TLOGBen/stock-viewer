import { describe, expect, it } from "vitest";

import { parseMarginRow } from "../src/domain/margin.js";

// Real MI_MARGN row for 1513 (probed live; C5 fixture). Balances are in 張.
const row1513: Record<string, unknown> = {
  股票代號: "1513",
  股票名稱: "中興電",
  融資前日餘額: "10220",
  融資今日餘額: "10160",
  融券前日餘額: "69",
  融券今日餘額: "89",
};

describe("parseMarginRow — MI_MARGN 融資融券 (張, not 股)", () => {
  it("reads today's balances in 張 and computes 券資比", () => {
    const m = parseMarginRow(row1513);
    expect(m.marginBalance).toBe(10160); // 張, no /1000
    expect(m.shortBalance).toBe(89);
    expect(m.shortMarginRatioPct).toBeCloseTo((89 / 10160) * 100, 6); // ≈0.876%
  });

  it("guards against divide-by-zero / blank 融資餘額", () => {
    expect(parseMarginRow({ 融資今日餘額: "0", 融券今日餘額: "5" }).shortMarginRatioPct).toBeNull();
    expect(parseMarginRow({ 融券今日餘額: "5" }).marginBalance).toBeNull();
  });
});
