import { describe, it, expect } from "vitest";
import { deriveRevenuePercents } from "../src/domain/revenueDerive.js";
import type { MonthlyRevenue } from "../src/domain/revenue.js";

/**
 * TASK-domain-01 — pure derivation of mom/yoy/accYoy from a complete monthly
 * revenue series. accYoy follows TWSE's cumulative-YTD-vs-prior-year-cumulative
 * definition and MUST be null (never approximated) when any constituent month
 * of either year's Jan→M window is missing.
 */
function rev(yearMonth: string, revenueThousands: number | null): MonthlyRevenue {
  return { yearMonth, revenueThousands, momPct: null, yoyPct: null, accYoyPct: null };
}

describe("deriveRevenuePercents — mom/yoy", () => {
  it("computes mom from the immediately-prior month", () => {
    const out = deriveRevenuePercents([rev("2026-01", 100_000), rev("2026-02", 110_000)]);
    const feb = out.find((r) => r.yearMonth === "2026-02")!;
    expect(feb.momPct).toBe(10); // (110-100)/100 = +10%
  });

  it("mom is null when the prior month is absent", () => {
    const out = deriveRevenuePercents([rev("2026-03", 120_000)]);
    expect(out[0]!.momPct).toBeNull();
  });

  it("computes yoy from the same month a year earlier", () => {
    const out = deriveRevenuePercents([rev("2025-05", 200_000), rev("2026-05", 230_000)]);
    const m = out.find((r) => r.yearMonth === "2026-05")!;
    expect(m.yoyPct).toBe(15); // (230-200)/200 = +15%
  });

  it("yoy is null when the prior-year month is absent", () => {
    const out = deriveRevenuePercents([rev("2026-05", 230_000)]);
    expect(out[0]!.yoyPct).toBeNull();
  });

  it("mom/yoy null when the current month's revenue is null", () => {
    const out = deriveRevenuePercents([rev("2026-01", 100_000), rev("2026-02", null)]);
    const feb = out.find((r) => r.yearMonth === "2026-02")!;
    expect(feb.momPct).toBeNull();
    expect(feb.yoyPct).toBeNull();
  });
});

describe("deriveRevenuePercents — accYoy (cumulative YTD)", () => {
  it("computes accYoy from full Jan→M of both years", () => {
    // 2025: Jan 100, Feb 100 → YTD(Feb)=200 ; 2026: Jan 110, Feb 120 → YTD(Feb)=230
    const out = deriveRevenuePercents([
      rev("2025-01", 100_000),
      rev("2025-02", 100_000),
      rev("2026-01", 110_000),
      rev("2026-02", 120_000),
    ]);
    const feb26 = out.find((r) => r.yearMonth === "2026-02")!;
    expect(feb26.accYoyPct).toBe(15); // (230-200)/200 = +15%
  });

  it("accYoy is null when a constituent month of the CURRENT year is missing", () => {
    // 2026 missing Jan → cannot sum YTD(Feb) for current year
    const out = deriveRevenuePercents([
      rev("2025-01", 100_000),
      rev("2025-02", 100_000),
      rev("2026-02", 120_000),
    ]);
    const feb26 = out.find((r) => r.yearMonth === "2026-02")!;
    expect(feb26.accYoyPct).toBeNull();
  });

  it("accYoy is null when a constituent month of the PRIOR year is missing", () => {
    // 2025 missing Jan → cannot sum YTD(Feb) for prior year
    const out = deriveRevenuePercents([
      rev("2025-02", 100_000),
      rev("2026-01", 110_000),
      rev("2026-02", 120_000),
    ]);
    const feb26 = out.find((r) => r.yearMonth === "2026-02")!;
    expect(feb26.accYoyPct).toBeNull();
  });

  it("January accYoy = its yoy (YTD is just January)", () => {
    const out = deriveRevenuePercents([rev("2025-01", 100_000), rev("2026-01", 130_000)]);
    const jan26 = out.find((r) => r.yearMonth === "2026-01")!;
    expect(jan26.accYoyPct).toBe(30);
  });
});

describe("deriveRevenuePercents — purity & shape", () => {
  it("does not mutate input and preserves yearMonth/revenue", () => {
    const input = [rev("2026-01", 100_000)];
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = deriveRevenuePercents(input);
    expect(input).toEqual(snapshot); // unchanged
    expect(out[0]!.yearMonth).toBe("2026-01");
    expect(out[0]!.revenueThousands).toBe(100_000);
  });
});
