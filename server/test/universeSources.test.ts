import { describe, expect, it } from "vitest";

import {
  classifyType,
  mapTwseRow,
  mapTpexRow,
  normalizeUniverse,
} from "../src/universe/sources.js";

/** Inline samples mirroring the real STOCK_DAY_ALL / TPEx row shapes. */
const TWSE_ROWS = [
  { Code: "2330", Name: "台積電", ClosingPrice: "1000.00" },
  { Code: "0050", Name: "元大台灣50", ClosingPrice: "180.00" },
  { Code: "", Name: "no code", ClosingPrice: "1" }, // skipped
  { Code: "9999", Name: "", ClosingPrice: "1" }, // skipped (empty name)
];

const TPEX_ROWS = [
  { SecuritiesCompanyCode: "6488", CompanyName: "環球晶", Close: "500.00" },
  { SecuritiesCompanyCode: "00679B", CompanyName: "元大美債20年", Close: "30.0" },
  { SecuritiesCompanyCode: "2330", CompanyName: "DUPLICATE", Close: "1" }, // tse wins
  { SecuritiesCompanyCode: "  ", CompanyName: "blank", Close: "1" }, // skipped
];

describe("classifyType", () => {
  it("00-prefixed → etf, else stock", () => {
    expect(classifyType("0050")).toBe("etf");
    expect(classifyType("00679B")).toBe("etf");
    expect(classifyType("2330")).toBe("stock");
    expect(classifyType("6488")).toBe("stock");
  });
});

describe("mapTwseRow", () => {
  it("maps Code/Name to a tse Security", () => {
    expect(mapTwseRow({ Code: "2330", Name: "台積電" })).toEqual({
      symbol: "2330",
      name: "台積電",
      exch: "tse",
      type: "stock",
    });
  });

  it("returns null for empty code or name", () => {
    expect(mapTwseRow({ Code: "", Name: "x" })).toBeNull();
    expect(mapTwseRow({ Code: "1", Name: "" })).toBeNull();
  });
});

describe("mapTpexRow", () => {
  it("maps SecuritiesCompanyCode/CompanyName to an otc Security", () => {
    expect(
      mapTpexRow({ SecuritiesCompanyCode: "6488", CompanyName: "環球晶" }),
    ).toEqual({ symbol: "6488", name: "環球晶", exch: "otc", type: "stock" });
  });

  it("classifies an OTC ETF code", () => {
    expect(
      mapTpexRow({ SecuritiesCompanyCode: "00679B", CompanyName: "元大美債" })
        ?.type,
    ).toBe("etf");
  });
});

describe("normalizeUniverse", () => {
  it("merges both feeds with correct exch/type and dedupes (tse wins)", () => {
    const out = normalizeUniverse(TWSE_ROWS, TPEX_ROWS);
    const bySym = new Map(out.map((s) => [s.symbol, s]));

    // tse rows mapped
    expect(bySym.get("2330")).toEqual({
      symbol: "2330",
      name: "台積電",
      exch: "tse",
      type: "stock",
    });
    expect(bySym.get("0050")?.type).toBe("etf");

    // tpex rows mapped
    expect(bySym.get("6488")?.exch).toBe("otc");
    expect(bySym.get("00679B")?.type).toBe("etf");

    // tse wins the 2330 clash → name stays 台積電, not DUPLICATE
    expect(bySym.get("2330")?.name).toBe("台積電");

    // empty-code/name/blank rows are skipped
    expect(out.every((s) => s.symbol !== "" && s.name !== "")).toBe(true);
    expect(out.length).toBe(4); // 2330, 0050, 6488, 00679B
  });

  it("tolerates non-array inputs", () => {
    expect(normalizeUniverse(null, undefined)).toEqual([]);
    expect(normalizeUniverse(TWSE_ROWS, null).length).toBe(2);
  });
});
