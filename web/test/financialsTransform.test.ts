import { describe, it, expect } from "vitest";
import type { FinancialsView } from "~/types";
import {
  incomeRows,
  ratioRows,
  grossMarginPct,
  operatingMarginPct,
  netMarginPct,
  formatThousands,
  formatEps,
  formatRatioPct,
} from "~/utils/financialsTransform";

/**
 * A realistic single-quarter FinancialsView. Amounts in 仟元 (income/balance),
 * EPS/bvps in 元; debtRatio/roe are fractions (×100 for %). Chosen so the
 * derived margins land on clean numbers:
 *   revenue 1,000,000 仟 (= 10 億), grossProfit 400,000 → 毛利率 40%,
 *   operatingIncome 250,000 → 營益率 25%, netIncome 200,000 → 淨利率 20%.
 */
const VIEW: FinancialsView = {
  symbol: "2330",
  coverage: true,
  variant: "ci",
  statement: {
    period: "2025Q1",
    revenue: 1_000_000,
    grossProfit: 400_000,
    operatingIncome: 250_000,
    netIncome: 200_000,
    eps: 8.7,
    variant: "ci",
  },
  balance: {
    period: "2025Q1",
    totalAssets: 5_000_000,
    totalLiab: 2_000_000,
    totalEquity: 3_000_000,
    bvps: 30.5,
  },
  debtRatio: 0.4, // 40%
  roe: 0.0667, // 6.67%
};

describe("incomeRows", () => {
  it("returns the five income lines in reporting order with EPS flagged", () => {
    const rows = incomeRows(VIEW);
    expect(rows.map((r) => r.label)).toEqual([
      "營業收入",
      "營業毛利",
      "營業利益",
      "本期淨利",
      "基本每股盈餘",
    ]);
    expect(rows[0].thousands).toBe(1_000_000);
    expect(rows[4]).toEqual({ label: "基本每股盈餘", thousands: 8.7, isEps: true });
    expect(rows[0].isEps).toBeUndefined();
  });

  it("returns an empty list when there is no statement", () => {
    expect(incomeRows(null)).toEqual([]);
    expect(incomeRows({ ...VIEW, statement: null })).toEqual([]);
  });
});

describe("derived margins (known values)", () => {
  it("computes 毛利率 / 營益率 / 淨利率 as percentages", () => {
    expect(grossMarginPct(VIEW)).toBeCloseTo(40, 10);
    expect(operatingMarginPct(VIEW)).toBeCloseTo(25, 10);
    expect(netMarginPct(VIEW)).toBeCloseTo(20, 10);
  });

  it("returns null when revenue is missing or zero", () => {
    const zero = { ...VIEW, statement: { ...VIEW.statement!, revenue: 0 } };
    expect(grossMarginPct(zero)).toBeNull();
    const noRev = { ...VIEW, statement: { ...VIEW.statement!, revenue: null } };
    expect(operatingMarginPct(noRev)).toBeNull();
    expect(netMarginPct(null)).toBeNull();
  });
});

describe("ratioRows", () => {
  it("scales view fractions ×100 and includes derived margins", () => {
    const rows = ratioRows(VIEW);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.pct]));
    expect(byLabel["毛利率"]).toBeCloseTo(40, 10);
    expect(byLabel["負債比率"]).toBeCloseTo(40, 10); // debtRatio 0.4 ×100
    expect(byLabel["股東權益報酬率"]).toBeCloseTo(6.67, 10); // roe 0.0667 ×100
  });

  it("passes null through for unknown ratios and empty view", () => {
    const rows = ratioRows({ ...VIEW, debtRatio: null, roe: null });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.pct]));
    expect(byLabel["負債比率"]).toBeNull();
    expect(byLabel["股東權益報酬率"]).toBeNull();
    expect(ratioRows(null)).toEqual([]);
  });
});

describe("formatters", () => {
  it("collapses ≥1 億 worth of 仟元 to 億, else 仟", () => {
    expect(formatThousands(1_000_000)).toBe("10.00 億"); // 10 億
    expect(formatThousands(123_456)).toBe("1.23 億");
    expect(formatThousands(50_000)).toBe("50,000 仟");
    expect(formatThousands(null)).toBe("—");
  });

  it("formats EPS in 元 and ratios in %", () => {
    expect(formatEps(8.7)).toBe("8.70 元");
    expect(formatEps(null)).toBe("—");
    expect(formatRatioPct(40)).toBe("40.00%");
    expect(formatRatioPct(null)).toBe("—");
  });
});
