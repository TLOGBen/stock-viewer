import { describe, expect, it } from "vitest";

import { industryVariant, industryName } from "../src/domain/industry.js";

// Industry codes are the real TWSE 上市 「產業別」 values carried on t187ap03_L,
// verified live against the live opendata feed (offline known-truth values).
// "17" = 金融保險業; every 金控/銀行/保險 sample reports it. Non-financial codes
// differ (1101 台泥="01", 1513 中興電="05", 2330 台積電="24").

describe("industryVariant — two-way 一般 / 金融保險 split", () => {
  it("maps the 金融保險業 code 17 → financial (2880 華南金 et al.)", () => {
    expect(industryVariant("17")).toBe("financial");
  });

  it("maps a general industry code 05 → ci (1513 中興電)", () => {
    expect(industryVariant("05")).toBe("ci");
  });

  it("maps other general codes → ci", () => {
    expect(industryVariant("01")).toBe("ci"); // 水泥 台泥
    expect(industryVariant("24")).toBe("ci"); // 半導體 台積電
    expect(industryVariant("28")).toBe("ci"); // 電子零組件 鴻海
  });

  it("falls back to ci for a missing / blank / unknown code", () => {
    expect(industryVariant("")).toBe("ci");
    expect(industryVariant("99")).toBe("ci"); // TWSE does not use 99
    // @ts-expect-error guard against a non-string slipping through
    expect(industryVariant(undefined)).toBe("ci");
  });

  it("tolerates surrounding whitespace before classifying", () => {
    expect(industryVariant(" 17 ")).toBe("financial");
    expect(industryVariant(" 05 ")).toBe("ci");
  });

  it("never decides a financial sub-variant — financial means 'ask the usecase'", () => {
    // The single code 17 cannot distinguish _basi/_mim/_fh/_ins; the pure
    // function must collapse all of them to one 'financial' verdict.
    expect(industryVariant("17")).toBe("financial");
  });
});

describe("industryName — 產業別 code → Chinese name", () => {
  it("maps known codes to their official Chinese names", () => {
    expect(industryName("01")).toBe("水泥工業");
    expect(industryName("17")).toBe("金融保險業");
    expect(industryName("24")).toBe("半導體業");
    expect(industryName("28")).toBe("電子零組件業");
    expect(industryName("91")).toBe("存託憑證");
  });

  it("returns the raw (normalized) code for an unknown code", () => {
    expect(industryName("99")).toBe("99");
    expect(industryName("07")).toBe("07"); // TWSE skips 07
  });

  it("returns the trimmed code for a blank input", () => {
    expect(industryName("")).toBe("");
    expect(industryName("  ")).toBe("");
  });

  it("tolerates surrounding whitespace on a known code", () => {
    expect(industryName(" 17 ")).toBe("金融保險業");
  });
});
