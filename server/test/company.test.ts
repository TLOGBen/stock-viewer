import { describe, expect, it } from "vitest";

import { parseCompanyRow } from "../src/domain/company.js";

// Real t187ap03_L row for 1513 中興電 (probed live; C5 known-value fixture).
const row1513: Record<string, unknown> = {
  公司代號: "1513",
  公司簡稱: "中興電",
  董事長: "江馥年",
  總經理: "郭慧娟",
  產業別: "05",
  營利事業統一編號: "33029464",
  成立日期: "19560501",
  上市日期: "19940308",
  網址: "WWW.CHEM.COM.TW",
  股票過戶機構: "凱基證券股份有限公司",
};

describe("parseCompanyRow — t187ap03_L 公司基本資料", () => {
  it("maps the real 1513 row to a CompanyProfile (known values)", () => {
    expect(parseCompanyRow(row1513)).toEqual({
      symbol: "1513",
      shortName: "中興電",
      chairman: "江馥年",
      ceo: "郭慧娟",
      industryCode: "05",
      taxId: "33029464",
      foundDate: "19560501",
      listDate: "19940308",
      website: "WWW.CHEM.COM.TW",
      transferAgent: "凱基證券股份有限公司",
    });
  });

  it("trims whitespace and defaults missing optional cells to empty", () => {
    const r = parseCompanyRow({ 公司代號: " 2330 ", 董事長: " 魏哲家 " });
    expect(r?.symbol).toBe("2330");
    expect(r?.chairman).toBe("魏哲家");
    expect(r?.website).toBe("");
  });

  it("returns null when 公司代號 is missing", () => {
    expect(parseCompanyRow({ 公司簡稱: "無代號" })).toBeNull();
  });
});
