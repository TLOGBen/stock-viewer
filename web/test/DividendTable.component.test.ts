// @vitest-environment happy-dom
/**
 * Component tests for DividendTable.vue (股利政策).
 *
 * Runs in happy-dom (per-file docblock) so the global `node` env used by the
 * pure-logic suites is untouched. The per-symbol resource is mocked so no
 * network is hit; the real <StateBlock> is registered globally so we exercise
 * the actual success/empty rendering paths.
 *
 * Covers two data states (success / empty) per task, plus the 最近一次除權息日
 * summary line and ROC-packed 決議日 formatting. Dividend amounts carry no
 * 紅漲綠跌 colour (they are not 漲跌), so no colour assertions here.
 */
import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import type { ResourceStatus, DividendsView } from "~/types";
import StateBlock from "~/components/StateBlock.vue";
import DividendTable from "~/components/DividendTable.vue";

/** Controls what the mocked useDividends resource returns per test. */
const resource = {
  data: ref<DividendsView | null>(null),
  status: ref<ResourceStatus>("idle"),
  reload: vi.fn(),
};

vi.mock("~/composables/useStockResource", () => ({
  useDividends: () => resource,
}));

function mountTable() {
  return mount(DividendTable, {
    props: { symbol: "2330" },
    global: { components: { StateBlock } },
  });
}

describe("DividendTable.vue", () => {
  it("success: renders a row per 年度 newest-first with the 除權息 summary line", () => {
    resource.status.value = "success";
    resource.data.value = {
      symbol: "2330",
      coverage: true,
      series: [
        // intentionally oldest-first to prove newest-first sorting
        {
          year: "111",
          period: "Q4",
          cashDividend: 11,
          stockDividend: null,
          resolutionDate: "1120608",
        },
        {
          year: "112",
          period: "Q4",
          cashDividend: 13.5,
          stockDividend: 0,
          resolutionDate: "1130612",
        },
      ],
      // 2024-06-13 00:00:00 UTC+8 → epoch ms; 除息
      exDividend: {
        date: Date.UTC(2024, 5, 13) - 8 * 60 * 60 * 1000,
        refPriceBefore: 900,
        refPrice: 886.5,
        value: 13.5,
        kind: "息",
      },
    };

    const wrapper = mountTable();

    expect(wrapper.find("table.fin-table").exists()).toBe(true);
    const bodyRows = wrapper.findAll("tbody tr");
    expect(bodyRows).toHaveLength(2);

    // newest 年度 (112) on top
    const first = bodyRows[0].findAll("td");
    expect(first[0].text()).toBe("112");
    expect(first[1].text()).toBe("13.50"); // 現金股利 元/股
    expect(first[2].text()).toBe("0.00"); // 股票股利 0
    expect(first[3].text()).toBe("113/06/12"); // 決議日 ROC packed → YYY/MM/DD

    // 111 row second, stockDividend null →「—」
    const second = bodyRows[1].findAll("td");
    expect(second[0].text()).toBe("111");
    expect(second[1].text()).toBe("11.00");
    expect(second[2].text()).toBe("—");

    // 最近一次除權息日 summary line
    const ex = wrapper.find(".ex-line");
    expect(ex.exists()).toBe(true);
    expect(ex.text()).toContain("2024-06-13");
    expect(ex.text()).toContain("除息");
  });

  it("empty: shows the StateBlock 無資料 line and no table", () => {
    resource.status.value = "empty";
    resource.data.value = {
      symbol: "2330",
      coverage: false,
      series: [],
      exDividend: null,
    };

    const wrapper = mountTable();

    expect(wrapper.find("table").exists()).toBe(false);
    expect(wrapper.find(".ex-line").exists()).toBe(false);
    expect(wrapper.find(".state-block").exists()).toBe(true);
    expect(wrapper.text()).toContain("無資料");
  });
});
