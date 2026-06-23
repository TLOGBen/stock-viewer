/**
 * Taiwan trading fee model (TP-5/TP-6) — pure, no deps, no Vue.
 *
 * Commission (手續費): 0.1425% of gross, on BOTH buy and sell, after the
 * broker discount (feeDiscount, default 0.6 = 6 折), floored at minFee (20 元).
 * Tax (證交稅): sell only — 0.3% for stocks, 0.1% for ETFs; buy tax = 0.
 *
 * net is the cash impact of the leg:
 *   buy  → gross + commission           (cash you part with)
 *   sell → gross - commission - tax      (cash you receive)
 */
import { SHARES_PER_LOT } from "~/types";
import type { OrderSide, OrderUnit } from "~/types";

/** Itemised fee breakdown for one order leg. All amounts in TWD. */
export interface FeeBreakdown {
  gross: number; // 成交金額 = price * shares
  commission: number; // 手續費
  tax: number; // 交易稅 (sell only)
  net: number; // 淨額 (buy: gross+comm ; sell: gross-comm-tax)
}

/** Inputs for {@link computeFees}. */
export interface FeeInput {
  side: OrderSide;
  price: number;
  lots: number; // quantity in the chosen unit (張 or 股)
  unit?: OrderUnit; // "lot" (default) → *1000 ; "share" → as-is
  isEtf?: boolean; // sell-tax 0.1% (ETF) vs 0.3% (stock)
  feeDiscount?: number; // broker discount multiplier, default 0.6
  minFee?: number; // commission floor, default 20
}

const COMMISSION_RATE = 0.001425; // 0.1425%
const TAX_RATE_STOCK = 0.003; // 0.3%
const TAX_RATE_ETF = 0.001; // 0.1%

/** Round to whole TWD (banker's-rounding not required; half-up matches brokers). */
function roundTwd(n: number): number {
  return Math.round(n);
}

/**
 * Compute the Taiwan fee breakdown for a single order leg. Pure.
 * Non-finite / non-positive price or lots collapse to a zero breakdown so
 * callers never surface NaN in the UI.
 */
export function computeFees(input: FeeInput): FeeBreakdown {
  const {
    side,
    price,
    lots,
    unit = "lot",
    isEtf = false,
    feeDiscount = 0.6,
    minFee = 20,
  } = input;

  const shares = unit === "share" ? lots : lots * SHARES_PER_LOT;
  const safePrice = Number.isFinite(price) ? price : 0;
  const safeShares = Number.isFinite(shares) ? shares : 0;

  if (safePrice <= 0 || safeShares <= 0) {
    return { gross: 0, commission: 0, tax: 0, net: 0 };
  }

  const gross = safePrice * safeShares;
  const commission = Math.max(
    roundTwd(gross * COMMISSION_RATE * feeDiscount),
    minFee,
  );
  const tax =
    side === "sell"
      ? roundTwd(gross * (isEtf ? TAX_RATE_ETF : TAX_RATE_STOCK))
      : 0;

  const net = side === "buy" ? gross + commission : gross - commission - tax;

  return { gross, commission, tax, net };
}
