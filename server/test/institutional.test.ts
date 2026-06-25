import { describe, expect, it } from "vitest";

import { parseT86Row } from "../src/domain/institutional.js";

// Real rwd fund/T86 header + 1513 row (2026-06-24, probed live; C5 fixture).
const fields = [
  "證券代號",
  "證券名稱",
  "外陸資買進股數(不含外資自營商)",
  "外陸資賣出股數(不含外資自營商)",
  "外陸資買賣超股數(不含外資自營商)",
  "外資自營商買進股數",
  "外資自營商賣出股數",
  "外資自營商買賣超股數",
  "投信買進股數",
  "投信賣出股數",
  "投信買賣超股數",
  "自營商買賣超股數",
  "自營商買進股數(自行買賣)",
  "自營商賣出股數(自行買賣)",
  "自營商買賣超股數(自行買賣)",
  "自營商買進股數(避險)",
  "自營商賣出股數(避險)",
  "自營商買賣超股數(避險)",
  "三大法人買賣超股數",
];
const row1513 = [
  "1513", "中興電          ", "3,989,913", "6,997,335", "-3,007,422",
  "0", "0", "0", "4,394,000", "24,420", "4,369,580", "-416,652",
  "51,000", "339,000", "-288,000", "138,855", "267,507", "-128,652", "945,506",
];

describe("parseT86Row — rwd 三大法人 (fields-by-name, 股→張)", () => {
  it("maps the real 1513 row to net 張 (known values)", () => {
    const f = parseT86Row(fields, row1513);
    expect(f.foreignNet).toBeCloseTo(-3007.422, 3); // -3,007,422 股 ÷ 1000
    expect(f.trustNet).toBeCloseTo(4369.58, 2);
    expect(f.dealerNet).toBeCloseTo(-416.652, 3);
    expect(f.totalNet).toBeCloseTo(945.506, 3);
  });

  it("locates columns by name even when the order shifts", () => {
    // Reverse the columns: index-based parsing would break; name-based holds.
    const idx = fields.map((_, i) => i).reverse();
    const fields2 = idx.map((i) => fields[i]);
    const row2 = idx.map((i) => row1513[i]);
    const f = parseT86Row(fields2, row2);
    expect(f.foreignNet).toBeCloseTo(-3007.422, 3);
    expect(f.totalNet).toBeCloseTo(945.506, 3);
  });

  it("returns null for a column whose name is absent", () => {
    const f = parseT86Row(["證券代號"], ["1513"]);
    expect(f.foreignNet).toBeNull();
    expect(f.totalNet).toBeNull();
  });
});
