import type { CompanyProfile } from "../domain/index.js";
import { industryName } from "../domain/index.js";
import type { CompanyFetcher } from "./stockPageDeps.js";

/**
 * usecase/getCompany — resolve the 個股頁 「公司基本資料」 block. Reads the injected
 * ap03 fetcher (一筆 CompanyProfile or null), then enriches the raw 產業別 code
 * with its Chinese name via the pure domain map. Never throws — a fetch failure
 * or an absent symbol degrades to `coverage:false`.
 *
 * 「經營業務」 is intentionally absent (REQ-004): t187ap03_L carries no such field.
 */

/** Narrow deps subset for getCompany. */
export interface GetCompanyDeps {
  company: CompanyFetcher;
}

/** The 公司基本資料 view: the raw profile + the resolved industry name. */
export interface CompanyView {
  symbol: string;
  coverage: boolean;
  profile: CompanyProfile | null;
  /** 產業別 code → Chinese name (empty when no profile). */
  industryName: string;
}

/** A coverage:false view for a missing/failed company lookup. */
function empty(symbol: string): CompanyView {
  return { symbol, coverage: false, profile: null, industryName: "" };
}

export async function getCompany(
  deps: GetCompanyDeps,
  symbol: string,
): Promise<CompanyView> {
  try {
    const profile = await deps.company(symbol);
    if (profile == null) return empty(symbol);
    return {
      symbol,
      coverage: true,
      profile,
      industryName: industryName(profile.industryCode),
    };
  } catch (err) {
    console.error(`[getCompany] ${symbol} failed:`, err);
    return empty(symbol);
  }
}
