import { describe, expect, it } from "vitest";

import { mapMonthRevenueRows, mapPerRows } from "../scripts/finmindMapper.js";

/**
 * Fixture-pinned tests for the build-time FinMind→domain mapper. No network —
 * raw rows are hand-built from the known FinMind v4 shapes for 2330/1513.
 */

describe("finmindMapper.mapPerRows", () => {
  it("maps a FinMind TaiwanStockPER row to a ValuationPoint (date→ROC packed, pe/pb/yield mapped)", () => {
    const rows = [
      {
        date: "2026-06-24",
        stock_id: "2330",
        dividend_yield: 1.85,
        PER: 22.4,
        PBR: 6.31,
      },
    ];

    expect(mapPerRows(rows)).toEqual([
      { date: "1150624", pe: 22.4, pb: 6.31, dividendYieldPct: 1.85 },
    ]);
  });

  it("coerces string ratios and treats blank/absent cells as null", () => {
    const rows = [
      {
        date: "2025-01-02",
        stock_id: "1513",
        dividend_yield: "2.5",
        PER: "15.1",
        PBR: "",
      },
    ];

    expect(mapPerRows(rows)).toEqual([
      { date: "1140102", pe: 15.1, pb: null, dividendYieldPct: 2.5 },
    ]);
  });

  it("skips a row whose date is unparseable", () => {
    const rows = [
      { date: "bad-date", stock_id: "2330", dividend_yield: 1.0, PER: 10, PBR: 2 },
      { date: "2026-06-24", stock_id: "2330", dividend_yield: 1.0, PER: 10, PBR: 2 },
    ];

    const out = mapPerRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0]?.date).toBe("1150624");
  });
});

describe("finmindMapper.mapMonthRevenueRows", () => {
  it("verifies the unit decision against the known 1513 2026-05 value (FinMind 元 → domain 千元)", () => {
    // FinMind TaiwanStockMonthRevenue.revenue is in NTD (元). Domain
    // revenueThousands is 千元. 1513's 2026-05 published value is 23.92億 =
    // 2,392,022 千元, so FinMind would report 2,392,022,000 元 → /1000.
    const rows = [
      {
        date: "2026-05-10",
        stock_id: "1513",
        revenue_year: 2026,
        revenue_month: 5,
        revenue: 2_392_022_000,
        country: "Taiwan",
      },
    ];

    const out = mapMonthRevenueRows(rows);
    expect(out[0]?.yearMonth).toBe("2026-05");
    expect(out[0]?.revenueThousands).toBe(2_392_022);
  });

  it("derives mom/yoy/accYoy over the full series with hand-verified percentages", () => {
    // A compact 2-year fixture (元) so accYoy has a complete Jan→M on both years.
    // revenueThousands after /1000 is the round number in comments.
    const rows = [
      { revenue_year: 2024, revenue_month: 1, revenue: 100_000_000, stock_id: "9999", date: "2024-01-10" }, // 100,000 千元
      { revenue_year: 2024, revenue_month: 2, revenue: 200_000_000, stock_id: "9999", date: "2024-02-10" }, // 200,000
      { revenue_year: 2025, revenue_month: 1, revenue: 120_000_000, stock_id: "9999", date: "2025-01-10" }, // 120,000
      { revenue_year: 2025, revenue_month: 2, revenue: 240_000_000, stock_id: "9999", date: "2025-02-10" }, // 240,000
    ];

    const out = mapMonthRevenueRows(rows);

    const byYm = new Map(out.map((r) => [r.yearMonth, r]));

    // 2024-01: no prior month, no prior year → all null.
    expect(byYm.get("2024-01")).toEqual({
      yearMonth: "2024-01",
      revenueThousands: 100_000,
      momPct: null,
      yoyPct: null,
      accYoyPct: null,
    });

    // 2024-02: mom = (200000-100000)/100000 = 100%; yoy null; accYoy null (no 2023).
    expect(byYm.get("2024-02")).toMatchObject({
      revenueThousands: 200_000,
      momPct: 100,
      yoyPct: null,
      accYoyPct: null,
    });

    // 2025-01: mom = null (immediately-prior month 2024-12 is absent from the
    //          fixture — never approximated from 2024-02);
    //          yoy = (120000-100000)/100000 = 20%;
    //          accYoy Jan→1: cur=120000 prev=100000 → 20%.
    expect(byYm.get("2025-01")).toEqual({
      yearMonth: "2025-01",
      revenueThousands: 120_000,
      momPct: null,
      yoyPct: 20,
      accYoyPct: 20,
    });

    // 2025-02: mom = (240000-120000)/120000 = 100%; yoy = (240000-200000)/200000 = 20%;
    //          accYoy Jan→2: cur=120000+240000=360000 prev=100000+200000=300000 → 20%.
    expect(byYm.get("2025-02")).toEqual({
      yearMonth: "2025-02",
      revenueThousands: 240_000,
      momPct: 100,
      yoyPct: 20,
      accYoyPct: 20,
    });
  });

  it("yields null accYoy when a constituent month of the YTD window is missing", () => {
    // 2025 has Jan & Feb but 2024 only has Feb → 2025-02 accYoy needs 2024 Jan→2,
    // which is incomplete → null. yoy for 2025-02 still works (2024-02 present).
    const rows = [
      { revenue_year: 2024, revenue_month: 2, revenue: 200_000_000, stock_id: "9999", date: "2024-02-10" },
      { revenue_year: 2025, revenue_month: 1, revenue: 120_000_000, stock_id: "9999", date: "2025-01-10" },
      { revenue_year: 2025, revenue_month: 2, revenue: 240_000_000, stock_id: "9999", date: "2025-02-10" },
    ];

    const out = mapMonthRevenueRows(rows);
    const feb = out.find((r) => r.yearMonth === "2025-02");
    expect(feb?.accYoyPct).toBeNull();
    expect(feb?.yoyPct).toBe(20); // 2024-02 present
  });
});
