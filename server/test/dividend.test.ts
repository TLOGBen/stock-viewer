import { describe, expect, it } from "vitest";

import { parseDividendRow } from "../src/domain/dividend.js";

// Real t187ap45_L row for 1513 中興電 (probed live 2026-06-24; C5 known-value
// fixture). Cash dividend lives entirely in 盈餘分配 = 6.00 元/股; the other
// two cash columns and all three 配股 columns are "0.0". Units: 元/股.
const row1513: Record<string, unknown> = {
  公司代號: "1513",
  公司名稱: "中興電",
  股利年度: "114",
  期別: "1",
  "董事會（擬議）股利分派日": "1150310",
  股東會日期: "1150525",
  "股東配發-盈餘分配之現金股利(元/股)": "6.00000000",
  "股東配發-法定盈餘公積發放之現金(元/股)": "0.0",
  "股東配發-資本公積發放之現金(元/股)": "0.0",
  "股東配發-盈餘轉增資配股(元/股)": "0.0",
  "股東配發-法定盈餘公積轉增資配股(元/股)": "0.0",
  "股東配發-資本公積轉增資配股(元/股)": "0.0",
};

// Real row for 1229 聯華 — exercises BOTH cash and stock dividend summation:
// cash 盈餘分配 1.80 元/股, stock 盈餘轉增資 0.20 元/股. Units: 元/股.
const row1229: Record<string, unknown> = {
  公司代號: "1229",
  股利年度: "113",
  期別: "1",
  "董事會（擬議）股利分派日": "1150310",
  "股東配發-盈餘分配之現金股利(元/股)": "1.80000000",
  "股東配發-法定盈餘公積發放之現金(元/股)": "0.0",
  "股東配發-資本公積發放之現金(元/股)": "0.0",
  "股東配發-盈餘轉增資配股(元/股)": "0.20000000",
  "股東配發-法定盈餘公積轉增資配股(元/股)": "0.0",
  "股東配發-資本公積轉增資配股(元/股)": "0.0",
};

describe("parseDividendRow — t187ap45_L 股利分派", () => {
  it("maps the real 1513 row: cash summed to 6.00 元/股, no stock dividend", () => {
    const d = parseDividendRow(row1513);
    expect(d?.year).toBe("114");
    expect(d?.period).toBe("1");
    expect(d?.cashDividend).toBeCloseTo(6.0, 8);
    expect(d?.stockDividend).toBeCloseTo(0.0, 8);
    expect(d?.resolutionDate).toBe("1150310");
  });

  it("sums cash and stock across component columns (1229: 1.80 cash + 0.20 stock)", () => {
    const d = parseDividendRow(row1229);
    expect(d?.cashDividend).toBeCloseTo(1.8, 8);
    expect(d?.stockDividend).toBeCloseTo(0.2, 8);
  });

  it("returns null cash/stock when every component cell is blank, without throwing", () => {
    const d = parseDividendRow({ 股利年度: "114", 期別: "1" });
    expect(d?.cashDividend).toBeNull();
    expect(d?.stockDividend).toBeNull();
    expect(d?.resolutionDate).toBe("");
  });

  it("returns null when 股利年度 is missing", () => {
    expect(parseDividendRow({ 期別: "1" })).toBeNull();
  });
});
