import type { FaceLight, HealthLights, Exch, Candle } from "../domain/index.js";
import {
  recentTradingDays,
  industryVariant,
  scoreFundamental,
  scoreChip,
  scoreTechnical,
  scoreValuation,
  combineHealthLights,
  computeRoeAndDebtRatio,
} from "../domain/index.js";
import {
  DEFAULT_RECENT_DAYS,
  type StockPageDeps,
} from "./stockPageDeps.js";

/**
 * usecase/getHealthLights — assemble the four 健康燈號 (基本面/籌碼面/技術面/估值面)
 * into one HealthLights headline (REQ-011).
 *
 * Each face pulls its own source(s) under an INDEPENDENT try/catch and falls
 * back to a neutral, coverage:false light on any failure, so one dead source
 * never dilutes or breaks the rest. `combineHealthLights` then re-normalizes the
 * weights over only the covered faces and `buildHeadline` produces the
 * rule-based one-liner. The usecase itself NEVER throws.
 *
 * The scoring is entirely in the domain pure functions; this usecase only reads
 * the injected caches and shapes their output into each face's input.
 *
 *   基本面 = EPS (損益表) + 營收年增 (月營收) + ROE/負債比 (資產負債表 join)
 *   籌碼面 = 三大法人 (近 N 日 張) + 融資融券 (近 N 日餘額 + 最新券餘額)
 *   技術面 = 日K (historyCache，OTC 空圖 → coverage:false)
 *   估值面 = BWIBBU 最新 PE/PB/殖利率
 */

/** The faces this usecase needs from the full stock-page deps. */
export type GetHealthLightsDeps = StockPageDeps;

/** Latest EPS + revenue-YoY + ROE/負債比 → 基本面 face. */
async function fundamentalFace(
  deps: GetHealthLightsDeps,
  symbol: string,
): Promise<FaceLight> {
  try {
    // Resolve the income-statement variant the same two-way way getFinancials
    // does (a 金融保險 symbol probes the four sub-sheets in order).
    let profileCode = "";
    try {
      const profile = await deps.company(symbol);
      profileCode = profile?.industryCode ?? "";
    } catch (err) {
      console.error(`[getHealthLights] ${symbol} company probe failed:`, err);
    }
    const variants =
      industryVariant(profileCode) === "ci"
        ? (["ci"] as const)
        : (["basi", "mim", "fh", "ins"] as const);

    let statement: Awaited<ReturnType<typeof deps.financials>> = null;
    let resolvedVariant: (typeof variants)[number] | null = null;
    for (const v of variants) {
      try {
        const s = await deps.financials(symbol, v);
        if (s != null) {
          statement = s;
          resolvedVariant = v;
          break;
        }
      } catch (err) {
        console.error(`[getHealthLights] ${symbol} fin ${v} failed:`, err);
      }
    }

    let balance: Awaited<ReturnType<typeof deps.balance>> = null;
    if (resolvedVariant != null) {
      try {
        balance = await deps.balance(symbol, resolvedVariant);
      } catch (err) {
        console.error(`[getHealthLights] ${symbol} balance failed:`, err);
      }
    }

    let revenueYoyPct: number | null = null;
    try {
      const rev = await deps.revenue.getSeries(symbol);
      const latest = rev.length > 0 ? rev[rev.length - 1] : null;
      revenueYoyPct = latest?.yoyPct ?? null;
    } catch (err) {
      console.error(`[getHealthLights] ${symbol} revenue failed:`, err);
    }

    const finForJoin =
      statement != null && balance != null && statement.period === balance.period
        ? statement
        : null;
    const { roe, debtRatio } = computeRoeAndDebtRatio(finForJoin, balance);

    return scoreFundamental({
      eps: statement?.eps ?? null,
      revenueYoyPct,
      roePct: roe != null ? roe * 100 : null,
      debtRatioPct: debtRatio != null ? debtRatio * 100 : null,
    });
  } catch (err) {
    console.error(`[getHealthLights] ${symbol} fundamental face failed:`, err);
    return scoreFundamental({
      eps: null,
      revenueYoyPct: null,
      roePct: null,
      debtRatioPct: null,
    });
  }
}

/** 5-day price change % from the daily candles (for the 融資 反指標 read). */
function priceChangePct(daily: readonly Candle[], lookback = 5): number | null {
  if (daily.length < 2) return null;
  const last = daily[daily.length - 1]!.close;
  const prevIdx = Math.max(0, daily.length - 1 - lookback);
  const prev = daily[prevIdx]!.close;
  if (prev === 0) return null;
  return ((last - prev) / prev) * 100;
}

/** 三大法人 + 融資融券 近 N 日 → 籌碼面 face. */
async function chipFace(
  deps: GetHealthLightsDeps,
  symbol: string,
  now: Date,
  exch: Exch,
): Promise<FaceLight> {
  try {
    const dates = recentTradingDays(now, DEFAULT_RECENT_DAYS);

    const foreignNet: (number | null)[] = [];
    const trustNet: (number | null)[] = [];
    const dealerNet: (number | null)[] = [];
    try {
      const days = await deps.institutional.getRecentDays(dates); // newest-first
      for (const { map } of days) {
        const f = map.get(symbol);
        if (f != null) {
          foreignNet.push(f.foreignNet);
          trustNet.push(f.trustNet);
          dealerNet.push(f.dealerNet);
        }
      }
    } catch (err) {
      console.error(`[getHealthLights] ${symbol} institutional failed:`, err);
    }

    const marginBalance: (number | null)[] = [];
    let shortBalance: number | null = null;
    try {
      const days = await deps.margin.getRecentDays(dates); // newest-first
      for (const { map } of days) {
        const m = map.get(symbol);
        if (m != null) {
          marginBalance.push(m.marginBalance);
          if (shortBalance == null) shortBalance = m.shortBalance; // latest day
        }
      }
    } catch (err) {
      console.error(`[getHealthLights] ${symbol} margin failed:`, err);
    }

    let priceChg: number | null = null;
    try {
      const daily = await deps.history.getDaily(symbol, exch);
      priceChg = priceChangePct(daily);
    } catch (err) {
      console.error(`[getHealthLights] ${symbol} price-change failed:`, err);
    }

    return scoreChip({
      foreignNet,
      trustNet,
      dealerNet,
      marginBalance,
      shortBalance,
      priceChangePct: priceChg,
    });
  } catch (err) {
    console.error(`[getHealthLights] ${symbol} chip face failed:`, err);
    return scoreChip({
      foreignNet: [],
      trustNet: [],
      dealerNet: [],
      marginBalance: [],
      shortBalance: null,
      priceChangePct: null,
    });
  }
}

/** 日K (historyCache) → 技術面 face. OTC 空圖 → coverage:false (scoreTechnical). */
async function technicalFace(
  deps: GetHealthLightsDeps,
  symbol: string,
  exch: Exch,
): Promise<FaceLight> {
  try {
    const daily = await deps.history.getDaily(symbol, exch);
    return scoreTechnical(daily.map((c) => ({ close: c.close })));
  } catch (err) {
    console.error(`[getHealthLights] ${symbol} technical face failed:`, err);
    return scoreTechnical([]);
  }
}

/** 最新 BWIBBU PE/PB/殖利率 → 估值面 face. */
async function valuationFace(
  deps: GetHealthLightsDeps,
  symbol: string,
  now: Date,
): Promise<FaceLight> {
  try {
    const dates = recentTradingDays(now, DEFAULT_RECENT_DAYS);
    const days = await deps.valuation.getRecentDays(dates); // newest-first
    for (const { map } of days) {
      const pt = map.get(symbol);
      if (pt != null) {
        return scoreValuation({
          pe: pt.pe,
          pb: pt.pb,
          dividendYieldPct: pt.dividendYieldPct,
        });
      }
    }
    return scoreValuation({ pe: null, pb: null, dividendYieldPct: null });
  } catch (err) {
    console.error(`[getHealthLights] ${symbol} valuation face failed:`, err);
    return scoreValuation({ pe: null, pb: null, dividendYieldPct: null });
  }
}

/**
 * Assemble the four faces (in parallel; each isolated) → HealthLights. Never
 * throws. `asOf` is the assembly time when any face has coverage, else 0.
 */
export async function getHealthLights(
  deps: GetHealthLightsDeps,
  symbol: string,
  now: Date = new Date(),
): Promise<HealthLights> {
  const exch: Exch = deps.provider.get(symbol)?.exch ?? "tse";

  const [fundamental, chip, technical, valuation] = await Promise.all([
    fundamentalFace(deps, symbol),
    chipFace(deps, symbol, now, exch),
    technicalFace(deps, symbol, exch),
    valuationFace(deps, symbol, now),
  ]);

  const faces = [fundamental, chip, technical, valuation];
  const asOf = faces.some((f) => f.coverage) ? now.getTime() : 0;
  return combineHealthLights(symbol, faces, asOf);
}
