import { describe, expect, it } from "vitest";

import { parseExRightRow } from "../src/domain/exright.js";

// Real rwd exRight/TWT49U header + rows (2026-06-25, probed live; C5 fixture).
// Prices in 元; 資料日期 is a Chinese ROC date; 權/息 is the ex-kind label.
const fields = [
  "資料日期",
  "股票代號",
  "股票名稱",
  "除權息前收盤價",
  "除權息參考價",
  "權值+息值",
  "權/息",
  "漲停價格",
  "跌停價格",
  "開盤競價基準",
  "減除股利參考價",
  "詳細資料",
  "最近一次申報資料 季別/日期",
  "最近一次申報每股 (單位)淨值",
  "最近一次申報每股 (單位)盈餘",
];
// 江申 (1525), 除息: 前收 65.80 → 參考 63.00, 息值 2.80.
const row1525 = [
  "115年06月25日", "1525", "江申", "65.80", "63.00", "2.800000", "息",
  "69.30", "56.70", "63.00", "63.00", "1525,20260625",
  "115年第1季(https://mops.twse.com.tw/mops/web/t163sb01)", "69.39", "-0.82",
];

describe("parseExRightRow — rwd TWT49U (fields-by-name, ROC 中文日期)", () => {
  it("maps the real 1525 row to known values", () => {
    const ex = parseExRightRow(fields, row1525);
    expect(ex.date).toBe(Date.UTC(2026, 5, 25)); // 115年06月25日 → 2026-06-25
    expect(ex.refPriceBefore).toBeCloseTo(65.8, 2);
    expect(ex.refPrice).toBeCloseTo(63.0, 2);
    expect(ex.value).toBeCloseTo(2.8, 6);
    expect(ex.kind).toBe("息");
  });

  it("locates columns by name even when the order shifts", () => {
    const idx = fields.map((_, i) => i).reverse();
    const fields2 = idx.map((i) => fields[i]);
    const row2 = idx.map((i) => row1525[i]);
    const ex = parseExRightRow(fields2, row2);
    expect(ex.date).toBe(Date.UTC(2026, 5, 25));
    expect(ex.refPrice).toBeCloseTo(63.0, 2);
    expect(ex.kind).toBe("息");
  });

  it("narrows 權 ex-rights and rejects unknown kinds", () => {
    const rowQuan = [...row1525];
    rowQuan[6] = "權";
    expect(parseExRightRow(fields, rowQuan).kind).toBe("權");
    const rowOther = [...row1525];
    rowOther[6] = "權息";
    expect(parseExRightRow(fields, rowOther).kind).toBeNull();
  });

  it("degrades to NaN date / null cells when columns are absent", () => {
    const ex = parseExRightRow(["股票代號"], ["1525"]);
    expect(Number.isNaN(ex.date)).toBe(true);
    expect(ex.refPriceBefore).toBeNull();
    expect(ex.refPrice).toBeNull();
    expect(ex.value).toBeNull();
    expect(ex.kind).toBeNull();
  });

  it("returns NaN date for a malformed 資料日期", () => {
    const bad = [...row1525];
    bad[0] = "2026-06-25";
    expect(Number.isNaN(parseExRightRow(fields, bad).date)).toBe(true);
  });
});
