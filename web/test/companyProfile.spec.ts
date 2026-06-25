// @vitest-environment happy-dom
/**
 * CompanyProfile.vue + utils/companyProfile pure-helper tests.
 *
 * The component test runs in happy-dom (per-file docblock above) so the rest of
 * the node-env unit suite is untouched. StateBlock is registered as a global
 * component (it is a Nuxt auto-import at runtime) so the success slot renders.
 *
 * Fixtures mirror the GET /api/company/:symbol envelope shape exactly; numbers
 * carry no units here (profile is all identifiers / dates / free text).
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CompanyProfile from "~/components/CompanyProfile.vue";
import StateBlock from "~/components/StateBlock.vue";
import {
  profileRows,
  formatFoundDate,
  PROFILE_BLANK,
} from "~/utils/companyProfile";
import type { CompanyView, ResourceStatus } from "~/types";

/** 台積電 (2330) — realistic covered profile (founded 1987-02-21, listed 1994-09-05). */
const tsmc: CompanyView = {
  symbol: "2330",
  coverage: true,
  industryName: "半導體業",
  profile: {
    symbol: "2330",
    shortName: "台積電",
    chairman: "魏哲家",
    ceo: "魏哲家",
    industryCode: "24",
    taxId: "22099131",
    foundDate: "19870221",
    listDate: "19940905",
    website: "https://www.tsmc.com",
    transferAgent: "中國信託商業銀行股份有限公司代理部",
  },
};

const uncovered: CompanyView = {
  symbol: "0050",
  coverage: false,
  industryName: "",
  profile: null,
};

const mountWith = (props: { status: ResourceStatus; data: CompanyView | null }) =>
  mount(CompanyProfile, {
    props,
    global: { components: { StateBlock } },
  });

describe("utils/companyProfile", () => {
  describe("formatFoundDate", () => {
    it("hyphenates a packed YYYYMMDD date", () => {
      expect(formatFoundDate("19870221")).toBe("1987-02-21");
    });

    it("renders the blank placeholder for non-8-digit input", () => {
      expect(formatFoundDate("")).toBe(PROFILE_BLANK);
      expect(formatFoundDate("1987")).toBe(PROFILE_BLANK);
      expect(formatFoundDate("abcd0221")).toBe(PROFILE_BLANK);
      expect(formatFoundDate(null)).toBe(PROFILE_BLANK);
    });
  });

  describe("profileRows", () => {
    it("pairs the 產業別 code with its resolved Chinese name", () => {
      const rows = profileRows(tsmc);
      const industry = rows.find((r) => r.label === "產業別");
      expect(industry?.value).toBe("24 半導體業");
    });

    it("formats dates and omits a 經營業務 row", () => {
      const rows = profileRows(tsmc);
      const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
      expect(byLabel["成立日期"]).toBe("1987-02-21");
      expect(byLabel["上市日期"]).toBe("1994-09-05");
      expect(rows.some((r) => r.label === "經營業務")).toBe(false);
    });

    it("falls back to the placeholder for blank text fields", () => {
      const blanked: CompanyView = {
        ...tsmc,
        industryName: "",
        profile: { ...tsmc.profile!, chairman: "  ", industryCode: "" },
      };
      const rows = profileRows(blanked);
      const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
      expect(byLabel["董事長"]).toBe(PROFILE_BLANK);
      expect(byLabel["產業別"]).toBe(PROFILE_BLANK);
    });

    it("returns no rows when the profile is null", () => {
      expect(profileRows(uncovered)).toEqual([]);
    });
  });
});

describe("CompanyProfile.vue", () => {
  it("renders the statgrid with profile values on success", () => {
    const wrapper = mountWith({ status: "success", data: tsmc });

    expect(wrapper.find(".panel-title").text()).toBe("公司基本資料");
    const grid = wrapper.find(".company-grid");
    expect(grid.exists()).toBe(true);

    const cells = wrapper.findAll(".stat");
    expect(cells).toHaveLength(9); // 7 簡介 + 2 股務, no 經營業務

    const text = wrapper.text();
    expect(text).toContain("台積電");
    expect(text).toContain("24 半導體業");
    expect(text).toContain("1987-02-21");
    expect(text).toContain("https://www.tsmc.com");
    // no state line on success
    expect(wrapper.find(".state-block").exists()).toBe(false);
  });

  it("renders the empty StateBlock (no grid) when coverage is false", () => {
    const wrapper = mountWith({ status: "empty", data: uncovered });

    expect(wrapper.find(".company-grid").exists()).toBe(false);
    const state = wrapper.find(".state-block");
    expect(state.exists()).toBe(true);
    expect(state.classes()).toContain("state-empty");
    expect(state.text()).toContain("無資料");
  });
});
