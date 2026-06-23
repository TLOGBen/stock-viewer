import { describe, expect, it } from "vitest";

import type { Security } from "../src/types.js";
import { buildSearchIndex } from "../src/universe/searchIndex.js";

const SECURITIES: Security[] = [
  { symbol: "2330", name: "台積電", exch: "tse", type: "stock" },
  { symbol: "2317", name: "鴻海", exch: "tse", type: "stock" },
  { symbol: "2303", name: "聯電", exch: "tse", type: "stock" },
  { symbol: "0050", name: "元大台灣50", exch: "tse", type: "etf" },
  { symbol: "0056", name: "元大高股息", exch: "tse", type: "etf" },
  { symbol: "00878", name: "國泰永續高股息", exch: "tse", type: "etf" },
  { symbol: "TSLA", name: "Tesla Inc", exch: "otc", type: "stock" },
];

describe("buildSearchIndex", () => {
  it("ranks exact code (0) above code-prefix (1)", () => {
    const idx = buildSearchIndex(SECURITIES);
    const results = idx.search("2330");
    expect(results[0]?.symbol).toBe("2330");
    expect(results[0]?.rank).toBe(0);
  });

  it("code prefix ranks 1; multiple matches ordered by symbol", () => {
    const idx = buildSearchIndex(SECURITIES);
    const results = idx.search("23");
    // 2303, 2317, 2330 all code-prefix; sorted ascending by symbol.
    expect(results.map((r) => r.symbol)).toEqual(["2303", "2317", "2330"]);
    expect(results.every((r) => r.rank === 1)).toBe(true);
  });

  it("name startsWith ranks 2, name includes ranks 3", () => {
    const idx = buildSearchIndex(SECURITIES);
    const prefix = idx.search("元大");
    expect(prefix.every((r) => r.rank === 2)).toBe(true);
    expect(prefix.map((r) => r.symbol).sort()).toEqual(["0050", "0056"]);

    const includes = idx.search("高股息");
    // "元大高股息" (includes) + "國泰永續高股息" (includes) → rank 3.
    expect(includes.every((r) => r.rank === 3)).toBe(true);
    expect(includes.map((r) => r.symbol).sort()).toEqual(["0056", "00878"]);
  });

  it("orders ranks: exact > codePrefix > namePrefix > nameIncludes", () => {
    const mixed: Security[] = [
      { symbol: "9999", name: "AA test", exch: "tse", type: "stock" }, // name includes "test"
      { symbol: "TEST1", name: "ZZ", exch: "otc", type: "stock" }, // code startsWith "TEST"
      { symbol: "TEST", name: "Exact", exch: "otc", type: "stock" }, // exact code
      { symbol: "5555", name: "Testing", exch: "tse", type: "stock" }, // name prefix
    ];
    const idx = buildSearchIndex(mixed);
    const results = idx.search("TEST");
    expect(results.map((r) => r.rank)).toEqual([0, 1, 2, 3]);
    expect(results.map((r) => r.symbol)).toEqual([
      "TEST",
      "TEST1",
      "5555",
      "9999",
    ]);
  });

  it("is case-insensitive for code and name", () => {
    const idx = buildSearchIndex(SECURITIES);
    expect(idx.search("tsla")[0]?.symbol).toBe("TSLA");
    expect(idx.search("tesla")[0]?.symbol).toBe("TSLA");
  });

  it("returns [] for an empty / whitespace query", () => {
    const idx = buildSearchIndex(SECURITIES);
    expect(idx.search("")).toEqual([]);
    expect(idx.search("   ")).toEqual([]);
  });

  it("defaults limit to 20 and caps at 50", () => {
    const many: Security[] = Array.from({ length: 80 }, (_, i) => ({
      symbol: `1${String(i).padStart(3, "0")}`,
      name: `name ${i}`,
      exch: "tse",
      type: "stock",
    }));
    const idx = buildSearchIndex(many);
    expect(idx.search("1").length).toBe(20); // default
    expect(idx.search("1", 5).length).toBe(5); // honored
    expect(idx.search("1", 999).length).toBe(50); // capped
    expect(idx.search("1", 0).length).toBe(20); // non-positive → default
  });

  it("bySymbol maps every symbol; all() returns a copy", () => {
    const idx = buildSearchIndex(SECURITIES);
    expect(idx.bySymbol.get("2330")?.name).toBe("台積電");
    expect(idx.bySymbol.size).toBe(SECURITIES.length);
    const a = idx.all();
    a.push({ symbol: "X", name: "X", exch: "tse", type: "stock" });
    expect(idx.all().length).toBe(SECURITIES.length); // not mutated
  });
});
