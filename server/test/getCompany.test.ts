import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getCompany } from "../src/usecase/index.js";
import type { CompanyProfile } from "../src/domain/index.js";

/** A minimal 1513 profile with the real 產業別 code "05" (電機機械). */
const profile1513: CompanyProfile = {
  symbol: "1513",
  shortName: "中興電",
  chairman: "江義福",
  ceo: "謝裕雄",
  industryCode: "05",
  taxId: "11719009",
  foundDate: "19560501",
  listDate: "19730802",
  website: "https://www.chyun.com.tw",
  transferAgent: "中國信託商業銀行",
};

describe("usecase/getCompany", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("maps the ap03 profile and resolves 產業別 05 → 電機機械", async () => {
    const view = await getCompany({ company: async () => profile1513 }, "1513");
    expect(view.coverage).toBe(true);
    expect(view.profile?.chairman).toBe("江義福");
    expect(view.industryName).toBe("電機機械"); // known mapping for "05"
    // 「經營業務」 is intentionally absent — no such field on the view.
    expect(view.profile).not.toHaveProperty("business");
  });

  it("degrades to coverage:false when the symbol is absent (fetch returns null)", async () => {
    const view = await getCompany({ company: async () => null }, "9999");
    expect(view.coverage).toBe(false);
    expect(view.profile).toBeNull();
    expect(view.industryName).toBe("");
  });

  it("never throws when the fetcher rejects — degrades to coverage:false", async () => {
    const view = await getCompany(
      {
        company: async () => {
          throw new Error("opendata 503");
        },
      },
      "1513",
    );
    expect(view.coverage).toBe(false);
    expect(view.profile).toBeNull();
  });
});
