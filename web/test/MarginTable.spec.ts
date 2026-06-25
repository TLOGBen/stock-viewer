// @vitest-environment happy-dom
/**
 * Component test for the 融資融券 籌碼表. Same prop-driven contract as
 * InstitutionalTable.spec: the page owns the resource, the component takes
 * `status` + `data`. Two states are asserted per task.md — success (a mono
 * .fin-table row per day: 融資/融券 餘額 thousands-separated 張, 券資比 one
 * decimal + "%") and empty (the shared StateBlock takes over, no table painted).
 *
 * 量綱 sanity: 餘額 are 張 (lots), already 張 upstream (MI_MARGN balances are
 * NOT divided by 1000); the component only formats. Balances carry no 漲跌
 * semantic so they render plain mono — no c-up/c-down colouring.
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MarginTable from "../components/MarginTable.vue";
import type { MarginView } from "../types";

const sample: MarginView = {
  symbol: "2330",
  coverage: true,
  days: [
    {
      date: "20240625",
      marginBalance: 23456, // 張
      shortBalance: 1234, // 張
      shortMarginRatioPct: 5.26, // 券資比 % = 1234/23456×100 ≈ 5.26
    },
    {
      date: "20240624", // older — must sort below newest
      marginBalance: 22000,
      shortBalance: null, // 缺欄 → —
      shortMarginRatioPct: null,
    },
  ],
};

describe("MarginTable.vue", () => {
  it("success: paints a mono table, newest-first, with 張 餘額 + 券資比%", () => {
    const wrapper = mount(MarginTable, {
      props: { status: "success", data: sample },
    });

    expect(wrapper.find("table.fin-table").exists()).toBe(true);

    const rows = wrapper.findAll("tbody tr");
    expect(rows).toHaveLength(2);

    // newest day on top
    const top = rows[0].findAll("td");
    expect(top[0].text()).toBe("2024-06-25");
    expect(top[1].text()).toBe("23,456"); // 融資餘額 張
    expect(top[2].text()).toBe("1,234"); // 融券餘額 張
    expect(top[3].text()).toBe("5.3%"); // 券資比 one decimal
    // balances are plain mono — no 紅漲綠跌 colouring
    expect(top[1].classes()).not.toContain("c-up");
    expect(top[1].classes()).not.toContain("c-down");

    // older day below, null cells render「—」
    const bottom = rows[1].findAll("td");
    expect(bottom[0].text()).toBe("2024-06-24");
    expect(bottom[2].text()).toBe("—");
    expect(bottom[3].text()).toBe("—");
  });

  it("empty: hands over to StateBlock and paints no table", () => {
    const wrapper = mount(MarginTable, {
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
