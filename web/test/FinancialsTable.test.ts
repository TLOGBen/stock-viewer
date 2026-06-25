// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import type { FinancialsView } from "~/types";
import FinancialsTable from "~/components/FinancialsTable.vue";
import StateBlock from "~/components/StateBlock.vue";

/**
 * Component tests for FinancialsTable's four resource states (REQ-014, C4).
 * <StateBlock> is a Nuxt auto-import at runtime; here we register it globally so
 * the real never-success switching is exercised (success → slot, else state line).
 */
const global = { components: { StateBlock } };

const VIEW: FinancialsView = {
  symbol: "2330",
  coverage: true,
  variant: "ci",
  statement: {
    period: "2025Q1",
    revenue: 1_000_000, // 仟元 → 10 億
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
  debtRatio: 0.4,
  roe: 0.0667,
};

describe("FinancialsTable — success", () => {
  it("renders the 損益 rows and switches to 財務比率 on tab click", async () => {
    const wrapper = mount(FinancialsTable, {
      props: { status: "success", view: VIEW },
      global,
    });

    // income sub-tab is the default; the five line items are present.
    const text = wrapper.text();
    expect(text).toContain("營業收入");
    expect(text).toContain("基本每股盈餘");
    expect(text).toContain("10.00 億"); // revenue 1,000,000 仟 → 10 億
    expect(text).toContain("8.70 元"); // EPS
    // period sub-title surfaced in the header.
    expect(text).toContain("2025Q1");

    // switch to 財務比率 sub-tab.
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    await tabs[1].trigger("click");

    const ratioText = wrapper.text();
    expect(ratioText).toContain("毛利率");
    expect(ratioText).toContain("40.00%"); // 毛利率 = 400k/1000k & 負債比率 0.4
    expect(ratioText).toContain("6.67%"); // roe 0.0667 ×100
    // income rows no longer rendered once on the ratio tab.
    expect(ratioText).not.toContain("營業收入");
  });
});

describe("FinancialsTable — non-success states", () => {
  it("shows the 無資料 state line when empty (no table rendered)", () => {
    const wrapper = mount(FinancialsTable, {
      props: { status: "empty", view: null },
      global,
    });
    expect(wrapper.find("table").exists()).toBe(false);
    expect(wrapper.text()).toContain("無資料");
  });

  it("shows the error line with a retry button and emits retry", async () => {
    const wrapper = mount(FinancialsTable, {
      props: { status: "error", view: null },
      global,
    });
    expect(wrapper.find("table").exists()).toBe(false);
    expect(wrapper.text()).toContain("載入失敗");

    await wrapper.find("button.state-retry").trigger("click");
    expect(wrapper.emitted("retry")).toBeTruthy();
  });

  it("shows the 歷史累積中 line with the period count when accumulating", () => {
    const wrapper = mount(FinancialsTable, {
      props: { status: "accumulating", view: null, n: 2 },
      global,
    });
    expect(wrapper.find("table").exists()).toBe(false);
    expect(wrapper.text()).toContain("歷史累積中（2 期）");
  });
});
