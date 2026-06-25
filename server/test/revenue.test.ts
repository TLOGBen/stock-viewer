import { describe, expect, it } from "vitest";

import { parseRevenueRow } from "../src/domain/revenue.js";

// Real t187ap05_L row for 1513 (probed live; C5 known-value fixture).
// 當月營收 2392022 千元 = 23.92 億.
const row1513: Record<string, unknown> = {
  資料年月: "11505",
  公司代號: "1513",
  "營業收入-當月營收": "2392022",
  "營業收入-上月比較增減(%)": "3.6540759033789967",
  "營業收入-去年同月增減(%)": "3.6162698572560394",
  "累計營業收入-前期比較增減(%)": "2.325232220096636",
};

describe("parseRevenueRow — t187ap05_L 月營收", () => {
  it("maps the real 1513 row with 千元 revenue and ROC year-month", () => {
    const r = parseRevenueRow(row1513);
    expect(r?.yearMonth).toBe("2026-05");
    expect(r?.revenueThousands).toBe(2392022);
    expect(r?.yoyPct).toBeCloseTo(3.6162698, 5);
    expect(r?.momPct).toBeCloseTo(3.6540759, 5);
    expect(r?.accYoyPct).toBeCloseTo(2.3252322, 5);
  });

  it("treats blank/'-' numeric cells as null without throwing", () => {
    const r = parseRevenueRow({ 資料年月: "11505", "營業收入-當月營收": "-" });
    expect(r?.revenueThousands).toBeNull();
    expect(r?.yoyPct).toBeNull();
  });

  it("returns null when 資料年月 is unparseable", () => {
    expect(parseRevenueRow({ 資料年月: "bad" })).toBeNull();
  });
});
