// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RevenueTable from "~/components/RevenueTable.vue";
import type { RevenueView, MonthlyRevenue, ResourceStatus } from "~/types";

/**
 * StateBlock is a Nuxt auto-import in app code; under vitest we register a tiny
 * stub with the same slot contract: it renders the default slot only on
 * `status === "success"`, otherwise a state line carrying the status. This lets
 * the table test assert the success markup and the non-success delegation
 * without pulling the real StateBlock (covered by its own suite).
 */
const StateBlockStub = {
  props: { status: { type: String, required: true }, n: { default: null } },
  template: `
    <div class="state-block-stub">
      <slot v-if="status === 'success'" />
      <p v-else class="state-line" :data-status="status">{{ status }}</p>
    </div>
  `,
};

function makeView(series: MonthlyRevenue[]): RevenueView {
  return { symbol: "2330", coverage: true, series };
}

const row = (over: Partial<MonthlyRevenue>): MonthlyRevenue => ({
  yearMonth: "2025-05",
  revenueThousands: 320_520_743, // 千元 → 3,205.21 億
  momPct: 5.2,
  yoyPct: -3.1,
  accYoyPct: 12.0,
  ...over,
});

function mountTable(props: {
  status: ResourceStatus;
  view?: RevenueView | null;
  n?: number | null;
}) {
  return mount(RevenueTable, {
    props,
    global: { stubs: { StateBlock: StateBlockStub } },
  });
}

describe("RevenueTable — success", () => {
  it("renders a .fin-table row per month with 億 / signed % and 紅漲綠跌 classes", () => {
    const view = makeView([
      row({ yearMonth: "2025-05", momPct: 5.2, yoyPct: -3.1 }),
      row({ yearMonth: "2025-04", revenueThousands: 85_000, momPct: -1.0, yoyPct: 2.0 }),
    ]);
    const wrapper = mountTable({ status: "success", view });

    const bodyRows = wrapper.findAll("tbody tr");
    expect(bodyRows).toHaveLength(2);

    const firstCells = bodyRows[0].findAll("td");
    expect(firstCells[0].text()).toBe("2025/05");
    expect(firstCells[1].text()).toBe("3,205.21 億");
    // 月增 +5.2% → positive → c-up (red)
    expect(firstCells[2].text()).toBe("+5.20%");
    expect(firstCells[2].classes()).toContain("c-up");
    // 年增 -3.1% → negative → c-down (green)
    expect(firstCells[3].text()).toBe("-3.10%");
    expect(firstCells[3].classes()).toContain("c-down");

    // sub-億 revenue stays thousands-separated 千元
    expect(bodyRows[1].findAll("td")[1].text()).toBe("85,000 千");
  });

  it("orders newest-first regardless of input order", () => {
    const view = makeView([
      row({ yearMonth: "2025-03" }),
      row({ yearMonth: "2025-05" }),
      row({ yearMonth: "2025-04" }),
    ]);
    const wrapper = mountTable({ status: "success", view });
    const ym = wrapper.findAll("tbody tr td.ym").map((c) => c.text());
    expect(ym).toEqual(["2025/05", "2025/04", "2025/03"]);
  });

  it("paginates when rows exceed the default page size and switches page", async () => {
    const series = Array.from({ length: 14 }, (_, i) =>
      row({ yearMonth: `2024-${String(i + 1).padStart(2, "0")}` }),
    );
    const wrapper = mountTable({ status: "success", view: makeView(series) });

    // page 1 shows 10 rows (default size)
    expect(wrapper.findAll("tbody tr")).toHaveLength(10);
    expect(wrapper.find(".fin-pager").exists()).toBe(true);

    // jump to page 2 → remaining 4 rows
    const pageButtons = wrapper.findAll(".pager-num");
    await pageButtons[1].trigger("click");
    expect(wrapper.findAll("tbody tr")).toHaveLength(4);
  });
});

describe("RevenueTable — non-success states", () => {
  it("empty: delegates to StateBlock, no table rows", () => {
    const wrapper = mountTable({ status: "empty", view: makeView([]) });
    expect(wrapper.find("tbody tr").exists()).toBe(false);
    const line = wrapper.find(".state-line");
    expect(line.exists()).toBe(true);
    expect(line.attributes("data-status")).toBe("empty");
  });

  it("error: shows the error state line, no table", () => {
    const wrapper = mountTable({ status: "error", view: null });
    expect(wrapper.find(".fin-table").exists()).toBe(false);
    expect(wrapper.find(".state-line").attributes("data-status")).toBe("error");
  });
});
