import { describe, it, expect } from "vitest";
import {
  formatRevenue,
  formatRevenuePct,
  pctSignClass,
  formatYearMonth,
  pageSlice,
  pageCount,
  sortNewestFirst,
} from "~/utils/revenueFormat";
import type { MonthlyRevenue } from "~/types";

// 單位量綱: revenueThousands = 當月營收 in 千元. 1 億 = 100,000 千元.
describe("formatRevenue (千元 → 億 / 千分位)", () => {
  it("collapses ≥ 1 億 worth of 千元 to a 2dp 億 reading", () => {
    // 2330 台積電 2025-05 當月營收 ≈ 320,520,743 千元 → 3205.21 億.
    expect(formatRevenue(320_520_743)).toBe("3,205.21 億");
  });

  it("keeps sub-億 figures as thousands-separated 千元", () => {
    expect(formatRevenue(85_000)).toBe("85,000 千");
  });

  it("renders exactly 1 億 (100,000 千元) as 1.00 億", () => {
    expect(formatRevenue(100_000)).toBe("1.00 億");
  });

  it("handles negatives and null", () => {
    expect(formatRevenue(-150_000)).toBe("-1.50 億");
    expect(formatRevenue(null)).toBe("—");
    expect(formatRevenue(Number.NaN)).toBe("—");
  });
});

describe("formatRevenuePct (月增/年增/累計)", () => {
  it("signs positive and negative, em-dash on null", () => {
    expect(formatRevenuePct(12.34)).toBe("+12.34%");
    expect(formatRevenuePct(-5.6)).toBe("-5.60%");
    expect(formatRevenuePct(0)).toBe("0.00%");
    expect(formatRevenuePct(null)).toBe("—");
  });
});

describe("pctSignClass (紅漲綠跌)", () => {
  it("positive → c-up (red), negative → c-down (green), else c-flat", () => {
    expect(pctSignClass(1)).toBe("c-up");
    expect(pctSignClass(-1)).toBe("c-down");
    expect(pctSignClass(0)).toBe("c-flat");
    expect(pctSignClass(null)).toBe("c-flat");
  });
});

describe("formatYearMonth", () => {
  it("maps YYYY-MM → YYYY/MM, passes malformed through", () => {
    expect(formatYearMonth("2025-05")).toBe("2025/05");
    expect(formatYearMonth("2025")).toBe("2025");
  });
});

describe("pagination helpers (pure, immutable)", () => {
  const rows = Array.from({ length: 23 }, (_, i) => i);

  it("pageCount rounds up and is ≥ 1", () => {
    expect(pageCount(23, 10)).toBe(3);
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(10, 10)).toBe(1);
  });

  it("pageSlice returns the right 1-based window without mutating", () => {
    expect(pageSlice(rows, 1, 10)).toEqual(rows.slice(0, 10));
    expect(pageSlice(rows, 3, 10)).toEqual([20, 21, 22]);
    expect(rows.length).toBe(23); // untouched
  });
});

describe("sortNewestFirst", () => {
  it("orders by yearMonth descending and never mutates the input", () => {
    const series: MonthlyRevenue[] = [
      { yearMonth: "2025-03", revenueThousands: 1, momPct: null, yoyPct: null, accYoyPct: null },
      { yearMonth: "2025-05", revenueThousands: 3, momPct: null, yoyPct: null, accYoyPct: null },
      { yearMonth: "2025-04", revenueThousands: 2, momPct: null, yoyPct: null, accYoyPct: null },
    ];
    const sorted = sortNewestFirst(series);
    expect(sorted.map((r) => r.yearMonth)).toEqual(["2025-05", "2025-04", "2025-03"]);
    expect(series.map((r) => r.yearMonth)).toEqual(["2025-03", "2025-05", "2025-04"]);
  });
});
