import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getFinancials } from "../src/usecase/index.js";
import type {
  FinancialStatement,
  FinancialVariant,
  BalanceSheet,
} from "../src/domain/index.js";

/**
 * Real 1513 中興電 2026Q1 known truths (from the ci 損益表 + 資產負債 fixtures):
 *   EPS 1.94, 本期淨利 960263 千元
 *   資產總額 48754126, 負債總額 26877788, 權益總額 21876338 (千元)
 *   → 負債比 = 26877788 / 48754126 ≈ 0.5513
 *   → ROE   = 960263 / 21876338   ≈ 0.0439
 */
const fin1513: FinancialStatement = {
  period: "2026Q1",
  revenue: 6490639,
  grossProfit: 1685977,
  operatingIncome: 1203389,
  netIncome: 960263,
  eps: 1.94,
  variant: "ci",
};
const bal1513: BalanceSheet = {
  period: "2026Q1",
  totalAssets: 48754126,
  totalLiab: 26877788,
  totalEquity: 21876338,
  bvps: 43.57,
};

describe("usecase/getFinancials", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it("ci路徑：直接抓 _ci，join 資產負債算出已知 ROE/負債比", async () => {
    const view = await getFinancials(
      {
        financials: async (_s, v) => (v === "ci" ? fin1513 : null),
        balance: async () => bal1513,
      },
      "1513",
      "ci",
    );
    expect(view.coverage).toBe(true);
    expect(view.variant).toBe("ci");
    expect(view.statement?.eps).toBe(1.94);
    expect(view.debtRatio).toBeCloseTo(26877788 / 48754126, 10); // ≈0.5513
    expect(view.roe).toBeCloseTo(960263 / 21876338, 10); // ≈0.0439
  });

  it("financial路徑：成員查詢——略過前面變體，命中 fh 即用該變體", async () => {
    const fhStatement: FinancialStatement = { ...fin1513, variant: "fh" };
    const probed: FinancialVariant[] = [];
    const view = await getFinancials(
      {
        financials: async (_s, v) => {
          probed.push(v);
          // 該股只在 _fh 清單出現（基本/票券/保險皆查無）。
          return v === "fh" ? fhStatement : null;
        },
        balance: async (_s, v) => (v === "fh" ? { ...bal1513 } : null),
      },
      "2881",
      "financial",
    );
    // 依序探 basi → mim → fh（命中即停，未到 ins）。
    expect(probed).toEqual(["basi", "mim", "fh"]);
    expect(view.coverage).toBe(true);
    expect(view.variant).toBe("fh");
    expect(view.roe).toBeCloseTo(960263 / 21876338, 10);
  });

  it("financial路徑：四張子變體皆查無 → coverage:false（不報錯、不硬映射）", async () => {
    const view = await getFinancials(
      { financials: async () => null, balance: async () => null },
      "9999",
      "financial",
    );
    expect(view.coverage).toBe(false);
    expect(view.variant).toBeNull();
    expect(view.roe).toBeNull();
    expect(view.debtRatio).toBeNull();
  });

  it("period 不一致時 ROE 留 null（負債比仍由資產負債表算）", async () => {
    const view = await getFinancials(
      {
        financials: async () => ({ ...fin1513, period: "2025Q4" }),
        balance: async () => bal1513, // 2026Q1
      },
      "1513",
      "ci",
    );
    expect(view.roe).toBeNull(); // 不同期不 join 淨利
    expect(view.debtRatio).toBeCloseTo(26877788 / 48754126, 10); // 仍可算
  });

  it("never throws：損益表 fetch 拋錯 → coverage:false", async () => {
    const view = await getFinancials(
      {
        financials: async () => {
          throw new Error("opendata 500");
        },
        balance: async () => bal1513,
      },
      "1513",
      "ci",
    );
    expect(view.coverage).toBe(false);
  });
});
