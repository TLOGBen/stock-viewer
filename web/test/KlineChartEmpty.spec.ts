// @vitest-environment happy-dom
/**
 * Integration test for the OTC 無日K 降級 (REQ-013 / TASK-tech-01).
 *
 * TWSE RWD 日K only covers 上市 (listed) symbols, so an 上櫃 (OTC) symbol resolves
 * to an empty candle series (useKlines status='empty'). KlineChart MUST degrade
 * to a mono「無日K資料（上櫃）」line instead of drawing a broken/empty chart.
 *
 * Runs in happy-dom (per-file docblock) so the pure-logic suites' node env is
 * untouched. useKlines is mocked to drive each status; klinecharts is mocked so
 * no real chart lib loads (the empty path must not depend on it). useMarketData
 * is not used by KlineChart directly, so only useKlines needs stubbing.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import type { Candle, ResourceStatus } from "~/types";
import KlineChart from "~/components/KlineChart.client.vue";

/** Controls what the mocked useKlines resource returns per test. */
const resource = {
  candles: ref<Candle[]>([]),
  status: ref<ResourceStatus>("idle"),
};

// useKlines is a Nuxt auto-import — KlineChart references it as a bare global,
// not a static import. Stub it on globalThis so the component resolves it.
beforeAll(() => {
  vi.stubGlobal("useKlines", () => resource);
});

// Stub klinecharts so the dynamic import in onMounted resolves to a no-op chart
// — the OTC empty overlay must render regardless of the chart lib.
vi.mock("klinecharts", () => ({
  init: () => ({
    applyNewData: vi.fn(),
    updateData: vi.fn(),
    setStyles: vi.fn(),
    createIndicator: vi.fn(() => "pane"),
    removeIndicator: vi.fn(),
    resize: vi.fn(),
  }),
  dispose: vi.fn(),
}));

function mountChart() {
  return mount(KlineChart, {
    props: {
      symbol: "6488",
      interval: "D" as const,
      chartType: "candle_solid" as const,
      indicators: [],
    },
  });
}

describe("KlineChart — OTC 無日K 降級 (REQ-013)", () => {
  it("empty: shows 「無日K資料（上櫃）」 instead of a broken chart", async () => {
    resource.status.value = "empty";
    resource.candles.value = [];

    const wrapper = mountChart();
    await flushPromises();

    const line = wrapper.find(".kline-empty");
    expect(line.exists()).toBe(true);
    expect(line.text()).toBe("無日K資料（上櫃）");
    // the chart surface is still present (overlay, not a replacement) so layout
    // never collapses
    expect(wrapper.find(".kline-chart").exists()).toBe(true);
  });

  it("success: hides the empty line and keeps the chart surface", async () => {
    resource.status.value = "success";
    resource.candles.value = [
      { timestamp: 1, open: 1, high: 2, low: 1, close: 2, volume: 10 },
    ];

    const wrapper = mountChart();
    await flushPromises();

    expect(wrapper.find(".kline-empty").exists()).toBe(false);
    expect(wrapper.find(".kline-chart").exists()).toBe(true);
  });

  it("loading: keeps the chart surface with no empty line (late fold may paint)", async () => {
    resource.status.value = "loading";
    resource.candles.value = [];

    const wrapper = mountChart();
    await flushPromises();

    expect(wrapper.find(".kline-empty").exists()).toBe(false);
    expect(wrapper.find(".kline-chart").exists()).toBe(true);
  });
});
