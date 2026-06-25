// @vitest-environment happy-dom
/**
 * Component test for the 三大法人 籌碼表. Same prop-driven contract as
 * HealthLights.spec: the page owns the resource, the component takes
 * `status` + `data`. Two states are asserted per task.md — success (a mono
 * .fin-table row per day with 紅漲綠跌 colouring) and empty (the shared
 * StateBlock takes over, no table painted).
 *
 * 量綱 sanity: every *Net is 張 (lots), already /1000 from 股 upstream; the
 * component only formats. 紅漲綠跌 鐵律: 買超(正)=紅 c-up, 賣超(負)=綠 c-down.
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import InstitutionalTable from "../components/InstitutionalTable.vue";
import type { InstitutionalView } from "../types";

const sample: InstitutionalView = {
  symbol: "2330",
  coverage: true,
  days: [
    {
      date: "20240625",
      foreignNet: 12345, // 買超 → 紅 c-up
      trustNet: -6789, // 賣超 → 綠 c-down
      dealerNet: null, // 缺欄 → —
      totalNet: 5556,
    },
  ],
};

describe("InstitutionalTable.vue", () => {
  it("success: paints a mono table row with 紅漲綠跌 colouring", () => {
    const wrapper = mount(InstitutionalTable, {
      props: { status: "success", data: sample },
    });

    expect(wrapper.find("table.fin-table").exists()).toBe(true);

    const rows = wrapper.findAll("tbody tr");
    expect(rows).toHaveLength(1);

    const cells = rows[0].findAll("td");
    expect(cells[0].text()).toBe("2024-06-25");
    // 外資 買超 = 紅
    expect(cells[1].text()).toBe("12,345");
    expect(cells[1].classes()).toContain("c-up");
    // 投信 賣超 = 綠
    expect(cells[2].text()).toBe("-6,789");
    expect(cells[2].classes()).toContain("c-down");
    // 自營 缺欄 = —
    expect(cells[3].text()).toBe("—");
    expect(cells[3].classes()).toContain("c-flat");
    // 合計 買超 = 紅
    expect(cells[4].classes()).toContain("c-up");
  });

  it("empty: hands over to StateBlock and paints no table", () => {
    const wrapper = mount(InstitutionalTable, {
      props: {
        status: "empty",
        data: { symbol: "2330", coverage: false, days: [] },
      },
    });

    expect(wrapper.find("table").exists()).toBe(false);
    expect(wrapper.find(".state-block").exists()).toBe(true);
    expect(wrapper.text()).toContain("無資料");
  });
});
