import type {
  FinancialStatement,
  FinancialVariant,
  BalanceSheet,
} from "../domain/index.js";
import { computeRoeAndDebtRatio } from "../domain/index.js";
import {
  FINANCIAL_VARIANTS,
  type FinancialsByVariantFetcher,
  type BalanceByVariantFetcher,
} from "./stockPageDeps.js";

/**
 * usecase/getFinancials — resolve the 個股頁 「EPS/財報」 block, including ROE and
 * 負債比 derived from the 資產負債表.
 *
 * Variant routing (REQ-006 S1, the load-bearing rule): the 產業別 code can only
 * tell 一般 (`ci`) from 金融保險 (`financial`); it CANNOT distinguish the four
 * financial sub-sheets (_basi/_mim/_fh/_ins) because TWSE files all of 銀行/
 * 證券/金控/保險 under one 「金融保險業」 code. So:
 *   • `industryVariant(code) === 'ci'` → fetch the _ci sheet directly.
 *   • `=== 'financial'` → MEMBERSHIP LOOKUP: probe _basi/_mim/_fh/_ins in order
 *     and use the FIRST sheet that actually contains the symbol. None contain
 *     it → coverage:false (never a hard-mapped guess, never a throw).
 *
 * ROE/負債比 (REQ-006 S2 / N1): the resolved 損益表 point and the 資產負債表 point
 * are joined on the SAME 公司代號+年度+季別 (period=YYYYQn) by the injected
 * fetchers (both keyed by symbol+variant), then `computeRoeAndDebtRatio` derives
 *   負債比 = 負債總額 / 資產總額,  ROE = 稅後淨利 / 權益總額.
 * A missing balance sheet yields both null; a period mismatch leaves ROE null.
 *
 * The caller passes the already-resolved two-way `industryVariant` so this
 * usecase stays pure orchestration over the injected fetchers. Never throws.
 */

/** Narrow deps subset for getFinancials. */
export interface GetFinancialsDeps {
  financials: FinancialsByVariantFetcher;
  balance: BalanceByVariantFetcher;
}

/** The EPS/財報 view. */
export interface FinancialsView {
  symbol: string;
  coverage: boolean;
  /** Resolved variant (the membership-lookup result), or null when none. */
  variant: FinancialVariant | null;
  statement: FinancialStatement | null;
  balance: BalanceSheet | null;
  /** 負債總額 / 資產總額 (fraction; ×100 for %). null when unknown. */
  debtRatio: number | null;
  /** 稅後淨利 / 權益總額 (fraction; ×100 for %). null when unknown. */
  roe: number | null;
}

/** A coverage:false view for an unresolved/failed financials lookup. */
function empty(symbol: string): FinancialsView {
  return {
    symbol,
    coverage: false,
    variant: null,
    statement: null,
    balance: null,
    debtRatio: null,
    roe: null,
  };
}

/**
 * Resolve the income statement for a 金融保險 symbol by membership lookup: try
 * each financial sub-variant in order, return the first that contains the
 * symbol (statement + the variant it came from). null when none contain it.
 */
async function resolveFinancialMember(
  deps: GetFinancialsDeps,
  symbol: string,
): Promise<{ statement: FinancialStatement; variant: FinancialVariant } | null> {
  for (const variant of FINANCIAL_VARIANTS) {
    try {
      const statement = await deps.financials(symbol, variant);
      if (statement != null) return { statement, variant };
    } catch (err) {
      // One probed sheet failing must not abort the remaining probes.
      console.error(`[getFinancials] ${symbol} probe ${variant} failed:`, err);
    }
  }
  return null;
}

/**
 * @param deps             injected 損益表/資產負債表 fetchers (keyed by symbol+variant)
 * @param symbol           security code
 * @param industryVariant  the two-way `industryVariant(code)` result ('ci'|'financial')
 */
export async function getFinancials(
  deps: GetFinancialsDeps,
  symbol: string,
  industryVariant: "ci" | "financial",
): Promise<FinancialsView> {
  try {
    let statement: FinancialStatement | null = null;
    let variant: FinancialVariant | null = null;

    if (industryVariant === "ci") {
      try {
        statement = await deps.financials(symbol, "ci");
        if (statement != null) variant = "ci";
      } catch (err) {
        console.error(`[getFinancials] ${symbol} ci fetch failed:`, err);
      }
    } else {
      const member = await resolveFinancialMember(deps, symbol);
      if (member != null) {
        statement = member.statement;
        variant = member.variant;
      }
    }

    // No variant resolved → the symbol has no income statement we can read.
    if (variant == null) return empty(symbol);

    // Join the 資產負債表 on the SAME variant (same 公司代號+年度+季別).
    let balance: BalanceSheet | null = null;
    try {
      balance = await deps.balance(symbol, variant);
    } catch (err) {
      console.error(`[getFinancials] ${symbol} balance(${variant}) failed:`, err);
    }

    // ROE joins net income with equity only when the two sheets share a period.
    const finForJoin =
      statement != null && balance != null && statement.period === balance.period
        ? statement
        : null;
    const { roe, debtRatio } = computeRoeAndDebtRatio(finForJoin, balance);

    return {
      symbol,
      coverage: true,
      variant,
      statement,
      balance,
      debtRatio,
      roe,
    };
  } catch (err) {
    console.error(`[getFinancials] ${symbol} failed:`, err);
    return empty(symbol);
  }
}
