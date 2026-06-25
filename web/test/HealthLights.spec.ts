// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import HealthLights from "../components/HealthLights.vue";
import type { HealthLights as HealthLightsView } from "../types";

/**
 * Component test for the 四燈號健診 hero. Two states are asserted per task.md:
 * success (the hero paints score + four lamps + headline, with coverage=false
 * faces dimmed to「—」) and empty (the shared StateBlock takes over).
 *
 * 語意鐵律 sanity: a bullish overall colours the gauge c-up (紅); a bearish face
 * lamp colours c-down (綠). The 弱→強 bar is amber-only, never red/green.
 */
const sample: HealthLightsView = {
  symbol: "1513",
  overall: { score: 64, signal: "bullish" },
  faces: [
    {
      face: "fundamental",
      signal: "bullish",
      score: 17,
      coverage: true,
      reasons: [],
    },
    { face: "chip", signal: "bearish", score: 13, coverage: true, reasons: [] },
    {
      face: "technical",
      signal: "bullish",
      score: 21,
      coverage: true,
      reasons: [],
    },
    // valuation has no data yet → dimmed lamp, score shows「—」
    {
      face: "valuation",
      signal: "neutral",
      score: 0,
      coverage: false,
      reasons: [],
    },
  ],
  headline: "籌碼與技術偏多、估值偏貴",
  asOf: 1_750_000_000_000,
};

describe("HealthLights — success", () => {
  it("paints the overall score, four lamps, and the headline", () => {
    const wrapper = mount(HealthLights, {
      props: { status: "success", data: sample },
    });

    // overall big score + the headline line
    expect(wrapper.find(".hl-score").text()).toBe("64");
    expect(wrapper.find(".hl-headline").text()).toBe(
      "籌碼與技術偏多、估值偏貴",
    );

    // four lamps, one per face
    const faces = wrapper.findAll(".hl-face");
    expect(faces).toHaveLength(4);

    // panel title present (amber-tick header)
    expect(wrapper.find(".panel-title").text()).toBe("四燈號健診");
  });

  it("colours the overall gauge by signal (bullish → c-up 紅)", () => {
    const wrapper = mount(HealthLights, {
      props: { status: "success", data: sample },
    });
    expect(wrapper.find(".hl-gauge").classes()).toContain("c-up");
  });

  it("colours covered face lamps by their own signal", () => {
    const wrapper = mount(HealthLights, {
      props: { status: "success", data: sample },
    });
    const lamps = wrapper.findAll(".lamp");
    // fundamental bullish → c-up, chip bearish → c-down, technical bullish → c-up
    expect(lamps[0].classes()).toContain("c-up");
    expect(lamps[1].classes()).toContain("c-down");
    expect(lamps[2].classes()).toContain("c-up");
  });

  it("dims a coverage=false face to 「—」 with the 資料準備中 tooltip", () => {
    const wrapper = mount(HealthLights, {
      props: { status: "success", data: sample },
    });
    const valuation = wrapper.findAll(".hl-face")[3];
    expect(valuation.classes()).toContain("dim");
    expect(valuation.attributes("title")).toBe("資料準備中");
    expect(valuation.find(".hl-face-score").text()).toBe("—");
    // a dimmed face never borrows a semantic colour — its lamp is c-flat
    expect(valuation.find(".lamp").classes()).toContain("c-flat");
  });

  it("scores a covered face as n/25", () => {
    const wrapper = mount(HealthLights, {
      props: { status: "success", data: sample },
    });
    const fundamental = wrapper.findAll(".hl-face")[0];
    expect(fundamental.find(".hl-face-score").text()).toBe("17/25");
  });

  it("sizes the amber bar to the overall score (clamped 0–100)", () => {
    const wrapper = mount(HealthLights, {
      props: { status: "success", data: sample },
    });
    const bar = wrapper.find(".hl-bar > i");
    expect(bar.attributes("style")).toContain("width: 64%");
  });
});

describe("HealthLights — 詳細數據", () => {
  const withReasons: HealthLightsView = {
    ...sample,
    faces: [
      {
        face: "fundamental",
        signal: "bullish",
        score: 17,
        coverage: true,
        reasons: ["EPS 1.94 元（獲利）", "營收年增 9%"],
      },
      {
        face: "chip",
        signal: "bearish",
        score: 13,
        coverage: true,
        reasons: ["外資 5 日累淨 -11,057 張（連賣）"],
      },
      // covered but no reasons → excluded from the detail list
      {
        face: "technical",
        signal: "bullish",
        score: 21,
        coverage: true,
        reasons: [],
      },
      // no coverage → excluded
      {
        face: "valuation",
        signal: "neutral",
        score: 0,
        coverage: false,
        reasons: ["本益比 18"],
      },
    ],
  };

  it("lists per-face reasons for covered faces that have them, in face order", () => {
    const wrapper = mount(HealthLights, {
      props: { status: "success", data: withReasons },
    });
    const faces = wrapper.findAll(".hl-detail-face");
    // fundamental + chip carry reasons; technical (empty) and valuation (no
    // coverage) drop out.
    expect(faces).toHaveLength(2);
    expect(wrapper.find(".hl-detail-title").text()).toBe("四燈號健診詳細數據");
    expect(faces[0].text()).toContain("基本面");
    expect(faces[0].text()).toContain("EPS 1.94 元（獲利）");
    expect(faces[1].text()).toContain("外資 5 日累淨 -11,057 張（連賣）");
    // verdict label is surfaced next to the face name
    expect(faces[0].find(".hl-detail-head").text()).toContain("偏多");
  });

  it("omits the 詳細數據 block entirely when no covered face has reasons", () => {
    const wrapper = mount(HealthLights, {
      props: { status: "success", data: sample },
    });
    expect(wrapper.find(".hl-detail").exists()).toBe(false);
  });
});

describe("HealthLights — empty", () => {
  it("hands non-success states to StateBlock and paints no hero", () => {
    const wrapper = mount(HealthLights, {
      props: { status: "empty", data: null },
    });

    // the hero body is absent…
    expect(wrapper.find(".hl-body").exists()).toBe(false);
    // …and the shared StateBlock shows the 無資料 line
    expect(wrapper.find(".state-block").exists()).toBe(true);
    expect(wrapper.text()).toContain("無資料");
  });
});
