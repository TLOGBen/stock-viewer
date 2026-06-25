import { describe, expect, it } from "vitest";

import {
  computeRoeAndDebtRatio,
  parseBalanceRow,
  type FinancialStatementLike,
} from "../src/domain/balance.js";

// Real t187ap07_L_ci row for 1513 (probed live; C5 known-value fixture).
// Totals in 千元: 資產總額 48754126, 負債總額 26877788, 權益總額 21876338.
// 每股參考淨值 43.57 (NT$ per share, NOT 千元). 年度 115 / 季別 1 → 2026Q1.
const row1513ci: Record<string, unknown> = {
  出表日期: "1150625",
  年度: "115",
  季別: "1",
  公司代號: "1513",
  公司名稱: "中興電",
  資產總額: "48754126.00",
  負債總額: "26877788.00",
  權益總額: "21876338.00",
  每股參考淨值: "43.57",
};

// Real-shaped 金融 (basi/fh/ins) variant row using 總計 spelling (probed live).
const rowFinancialVariant: Record<string, unknown> = {
  年度: "114",
  季別: "4",
  公司代號: "2801",
  資產總計: "1234567",
  負債總計: "1000000",
  權益總計: "234567",
  每股參考淨值: "12.34",
};

describe("parseBalanceRow — t187ap07_L 資產負債表", () => {
  it("maps the real 1513 ci row with 千元 totals and 2026Q1 period", () => {
    const b = parseBalanceRow(row1513ci);
    expect(b?.period).toBe("2026Q1");
    expect(b?.totalAssets).toBe(48754126);
    expect(b?.totalLiab).toBe(26877788);
    expect(b?.totalEquity).toBe(21876338);
    expect(b?.bvps).toBeCloseTo(43.57, 2);
  });

  it("accepts the 金融變體 總計 column spelling", () => {
    const b = parseBalanceRow(rowFinancialVariant);
    expect(b?.period).toBe("2025Q4");
    expect(b?.totalAssets).toBe(1234567);
    expect(b?.totalLiab).toBe(1000000);
    expect(b?.totalEquity).toBe(234567);
    expect(b?.bvps).toBeCloseTo(12.34, 2);
  });

  it("treats blank/'-' numeric cells as null without throwing", () => {
    const b = parseBalanceRow({
      年度: "115",
      季別: "1",
      資產總額: "-",
      負債總額: "",
      權益總額: "-",
      每股參考淨值: "",
    });
    expect(b?.totalAssets).toBeNull();
    expect(b?.totalLiab).toBeNull();
    expect(b?.totalEquity).toBeNull();
    expect(b?.bvps).toBeNull();
  });

  it("returns null when 年度/季別 is missing", () => {
    expect(parseBalanceRow({ 公司代號: "1513" })).toBeNull();
    expect(parseBalanceRow({ 年度: "115" })).toBeNull();
  });
});

describe("computeRoeAndDebtRatio — join 損益表 + 資產負債表", () => {
  const bal1513 = parseBalanceRow(row1513ci)!;

  it("derives 負債比 = 負債/資產 and ROE = 稅後淨利/權益 from known values", () => {
    // Hypothetical but join-consistent net income (千元) for 1513 2026Q1.
    const fin: FinancialStatementLike = { period: "2026Q1", netIncome: 2187634 };
    const { roe, debtRatio } = computeRoeAndDebtRatio(fin, bal1513);
    // 負債比 = 26877788 / 48754126 = 0.5512926...
    expect(debtRatio).toBeCloseTo(26877788 / 48754126, 10);
    expect(debtRatio).toBeCloseTo(0.5512926, 6);
    // ROE = 2187634 / 21876338 = 0.100000...
    expect(roe).toBeCloseTo(2187634 / 21876338, 10);
    expect(roe).toBeCloseTo(0.1, 4);
  });

  it("yields roe=null when 損益表 is missing (資產負債表 still gives 負債比)", () => {
    const { roe, debtRatio } = computeRoeAndDebtRatio(null, bal1513);
    expect(roe).toBeNull();
    expect(debtRatio).toBeCloseTo(0.5512926, 6);
  });

  it("yields both null when 資產負債表 is missing", () => {
    const fin: FinancialStatementLike = { period: "2026Q1", netIncome: 2187634 };
    const { roe, debtRatio } = computeRoeAndDebtRatio(fin, null);
    expect(roe).toBeNull();
    expect(debtRatio).toBeNull();
  });

  it("guards against zero denominators", () => {
    const balZero = parseBalanceRow({
      年度: "115",
      季別: "1",
      資產總額: "0",
      負債總額: "100",
      權益總額: "0",
    })!;
    const fin: FinancialStatementLike = { period: "2026Q1", netIncome: 50 };
    const { roe, debtRatio } = computeRoeAndDebtRatio(fin, balZero);
    expect(roe).toBeNull();
    expect(debtRatio).toBeNull();
  });
});
