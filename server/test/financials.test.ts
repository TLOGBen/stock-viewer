import { describe, expect, it } from "vitest";
import {
  parseFinStatementRow,
  type FinancialStatement,
} from "../src/domain/financials.js";
import { finStatement1513CiRow } from "./fixtures/finStatement-1513-ci.js";

describe("parseFinStatementRow", () => {
  it("parses a real t187ap06_L_ci row (1513 中興電 2026Q1) with known-truth values", () => {
    const got = parseFinStatementRow(finStatement1513CiRow, "ci");
    expect(got).not.toBeNull();
    const fin = got as FinancialStatement;
    // ROC 115 + 1911 = 2026, 季別 1 → "2026Q1".
    expect(fin.period).toBe("2026Q1");
    // Known truth (仟元): revenue 6,490,639; grossProfit 1,685,977;
    // operatingIncome 1,203,389; netIncome 960,263. EPS 1.94 元/share.
    expect(fin.revenue).toBe(6490639);
    expect(fin.grossProfit).toBe(1685977);
    expect(fin.operatingIncome).toBe(1203389);
    expect(fin.netIncome).toBe(960263);
    expect(fin.eps).toBe(1.94);
    expect(fin.variant).toBe("ci");
  });

  it("converts ROC year and quarter to a Gregorian period", () => {
    const got = parseFinStatementRow({ 年度: "112", 季別: "4" }, "ci");
    expect(got?.period).toBe("2023Q4");
  });

  it("returns null when 年度 or 季別 is missing/unparseable", () => {
    expect(parseFinStatementRow({ 季別: "1" }, "ci")).toBeNull();
    expect(parseFinStatementRow({ 年度: "115" }, "ci")).toBeNull();
    expect(parseFinStatementRow({ 年度: "x", 季別: "1" }, "ci")).toBeNull();
  });

  it("rejects an out-of-range quarter", () => {
    expect(parseFinStatementRow({ 年度: "115", 季別: "0" }, "ci")).toBeNull();
    expect(parseFinStatementRow({ 年度: "115", 季別: "5" }, "ci")).toBeNull();
  });

  it("nulls revenue/grossProfit/operatingIncome for a 銀行業 (basi) variant lacking those lines", () => {
    // _basi has no 營業收入/營業毛利/營業利益 columns; only 本期淨利 + EPS.
    const basiRow = {
      年度: "115",
      季別: "1",
      公司代號: "2801",
      "本期淨利（淨損）": "1234567.00",
      "基本每股盈餘（元）": "0.55",
    };
    const got = parseFinStatementRow(basiRow, "basi");
    expect(got?.revenue).toBeNull();
    expect(got?.grossProfit).toBeNull();
    expect(got?.operatingIncome).toBeNull();
    expect(got?.netIncome).toBe(1234567);
    expect(got?.eps).toBe(0.55);
    expect(got?.variant).toBe("basi");
  });

  it("falls back to 本期稅後淨利（淨損） for the 金控業 (fh) net-income alias", () => {
    const fhRow = {
      年度: "115",
      季別: "1",
      "本期稅後淨利（淨損）": "8888888.00",
      "基本每股盈餘（元）": "1.20",
    };
    const got = parseFinStatementRow(fhRow, "fh");
    expect(got?.netIncome).toBe(8888888);
    expect(got?.eps).toBe(1.2);
  });

  it("nulls a blank / '-' EPS cell", () => {
    const got = parseFinStatementRow(
      { 年度: "115", 季別: "2", "基本每股盈餘（元）": "" },
      "ci",
    );
    expect(got?.eps).toBeNull();
    const got2 = parseFinStatementRow(
      { 年度: "115", 季別: "2", "基本每股盈餘（元）": "-" },
      "ci",
    );
    expect(got2?.eps).toBeNull();
  });
});
