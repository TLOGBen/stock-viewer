// @vitest-environment happy-dom
/**
 * Component test for 訊息 (個股重大訊息). Same prop-driven contract as the other
 * 個股 blocks: success lists announcements (ROC date + 主旨, NO view counts),
 * empty hands over to StateBlock. Asserts the official 來源 label is shown and
 * that no view-count text leaks in (the official feed has none).
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import Disclosures from "../components/Disclosures.vue";
import type { DisclosuresView } from "../types";

const sample: DisclosuresView = {
  symbol: "1513",
  coverage: true,
  items: [
    {
      symbol: "1513",
      dateRoc: "1150624",
      date: Date.UTC(2026, 5, 24),
      time: "64502",
      subject: "公告本公司董事會決議發放現金股利",
      factDateRoc: "1150624",
    },
  ],
};

describe("Disclosures.vue", () => {
  it("success: lists announcements (ROC date + 主旨), official source, no view counts", () => {
    const wrapper = mount(Disclosures, {
      props: { status: "success", data: sample },
    });
    const items = wrapper.findAll(".disc-item");
    expect(items).toHaveLength(1);
    expect(items[0].find(".disc-date").text()).toBe("115/06/24");
    expect(items[0].find(".disc-subject").text()).toContain("現金股利");
    expect(wrapper.text()).toContain("公開資訊觀測站");
    expect(wrapper.text()).not.toContain("瀏覽");
  });

  it("empty: hands over to StateBlock and paints no list", () => {
    const wrapper = mount(Disclosures, {
      props: {
        status: "empty",
        data: { symbol: "1513", coverage: false, items: [] },
      },
    });
    expect(wrapper.find(".disc-list").exists()).toBe(false);
    expect(wrapper.find(".state-block").exists()).toBe(true);
    expect(wrapper.text()).toContain("無資料");
  });
});
