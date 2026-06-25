// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import type { ValuationView, ValuationBand } from "~/types";
import ValuationRiver from "~/components/ValuationRiver.vue";
import StateBlock from "~/components/StateBlock.vue";

/**
 * Component tests for ValuationRiver's resource states (REQ-010, C4). The PE/PB
 * rivers render five quantile lanes (<rect>) over a hand-rolled SVG plus a
 * current-price marker (<line>). <StateBlock> is registered globally so the real
 * success → slot / else → state-line switching is exercised.
 */
const global = { components: { StateBlock } };

const PE_BAND: ValuationBand = {
  count: 20,
  min: 10,
  max: 30,
  p20: 14,
  p40: 18,
  p60: 22,
  p80: 26,
  current: 12, // cheap
  zone: "cheap",
};

const PB_BAND: ValuationBand = {
  count: 20,
  min: 1,
  max: 5,
  p20: 1.8,
  p40: 2.6,
  p60: 3.4,
  p80: 4.2,
  current: 4.5, // expensive
  zone: "expensive",
};

const VIEW: ValuationView = {
  symbol: "2330",
  coverage: true,
  series: [{ date: "1150624", pe: 12, pb: 4.5 }],
  pe: PE_BAND,
  pb: PB_BAND,
};

describe("ValuationRiver — success", () => {
  it("renders the PE river (5 lanes + marker) and switches to PB on tab click", async () => {
    const wrapper = mount(ValuationRiver, {
      props: { status: "success", view: VIEW },
      global,
    });

    // PE is the default metric: five quantile lane rects + one marker line.
    expect(wrapper.findAll("svg rect")).toHaveLength(5);
    expect(wrapper.findAll("svg line")).toHaveLength(1);

    // lane labels span 便宜→昂貴; PE current 12 is 便宜 (cheap).
    const text = wrapper.text();
    expect(text).toContain("便宜");
    expect(text).toContain("昂貴");
    expect(text).toContain("本益比 PE");
    expect(text).toContain("便宜"); // zone caption for current

    // marker line carries the cheap=紅(--up) valuation colour.
    expect(wrapper.find("svg line").attributes("stroke")).toBe("var(--up)");

    // switch to PB: expensive current 4.5 → 昂貴, marker now 綠(--down).
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    await tabs[1].trigger("click");

    expect(wrapper.text()).toContain("股價淨值比 PB");
    expect(wrapper.find("svg line").attributes("stroke")).toBe("var(--down)");
  });

  it("omits the marker line when the band has no current value", () => {
    const noCurrent: ValuationView = {
      ...VIEW,
      pe: { ...PE_BAND, current: null, zone: null },
    };
    const wrapper = mount(ValuationRiver, {
      props: { status: "success", view: noCurrent },
      global,
    });
    expect(wrapper.findAll("svg rect")).toHaveLength(5);
    expect(wrapper.findAll("svg line")).toHaveLength(0);
  });
});

describe("ValuationRiver — non-success states", () => {
  it("shows the 無資料 state line when empty (no chart rendered)", () => {
    const wrapper = mount(ValuationRiver, {
      props: { status: "empty", view: null },
      global,
    });
    expect(wrapper.find("svg").exists()).toBe(false);
    expect(wrapper.text()).toContain("無資料");
  });

  it("shows the 歷史累積中 line with the period count when accumulating", () => {
    const wrapper = mount(ValuationRiver, {
      props: { status: "accumulating", view: null, n: 3 },
      global,
    });
    expect(wrapper.find("svg").exists()).toBe(false);
    expect(wrapper.text()).toContain("歷史累積中（3 期）");
  });

  it("shows the error line with a retry button and emits retry", async () => {
    const wrapper = mount(ValuationRiver, {
      props: { status: "error", view: null },
      global,
    });
    expect(wrapper.find("svg").exists()).toBe(false);
    expect(wrapper.text()).toContain("載入失敗");

    await wrapper.find("button.state-retry").trigger("click");
    expect(wrapper.emitted("retry")).toBeTruthy();
  });
});
