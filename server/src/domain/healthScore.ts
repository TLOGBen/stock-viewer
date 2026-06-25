/**
 * 四面向健康燈號評分 (基本面/籌碼面/技術面/估值面) + 綜合合成。純函式，禁 IO。
 *
 * 移植自 plugin 的 Python 計分腳本 (score.py / score_chips.py / ensemble.py)：
 * 每個面向先算一個 [-1, 1] 的「方向訊號」(signal value)，再以不對稱門檻
 * (CHIP_BULLISH / CHIP_BEARISH) 分類成 bullish/neutral/bearish，並線性映射成
 * 0-25 的面向分數 (neutral = 12.5)。combineHealthLights 把有 coverage 的面向
 * 等權重平均成 overall 0-100，缺面向 coverage=false 不計入 (重正規化)。
 *
 * 設計約束：
 * - 所有計分皆純函式，輸入已解析好的數字 / Candle[]，本檔不做任何解析或 IO。
 * - 門檻為具名常數 (仿 domain 既有 FAILURE_THRESHOLD)，單一定義各處引用。
 * - 空方需更強證據：BEARISH 門檻 (-0.30) 比 BULLISH 門檻 (+0.10) 嚴格 (對齊 plugin)。
 * - 籌碼單日 degrade：缺料的子項跳過並重正規化其餘權重，不以 0 稀釋。
 */

/** 多空分類門檻 (不對稱：空方需更強證據)。對齊 plugin BULL_TH / BEAR_TH。 */
export const CHIP_BULLISH = 0.1;
export const CHIP_BEARISH = -0.3;

/** 面向滿分。overall 為 4 面向 × 25 = 100。 */
export const FACE_MAX_SCORE = 25;
/** 面向中性分 (signal 0 對應)。 */
const FACE_NEUTRAL_SCORE = FACE_MAX_SCORE / 2;

export type Signal = "bullish" | "neutral" | "bearish";
export type FaceName = "fundamental" | "chip" | "technical" | "valuation";

/** 單一面向燈號。score 0-25；coverage=false 表示該面向無足夠資料 (不計入 overall)。 */
export interface FaceLight {
  face: FaceName;
  signal: Signal;
  /** 0-25，由 [-1,1] 方向訊號線性映射 (neutral=12.5)。 */
  score: number;
  coverage: boolean;
  /** 人類可讀的判讀理由 (規則樣板，非 LLM)。 */
  reasons: string[];
}

/** 個股四面向綜合健康燈號。 */
export interface HealthLights {
  symbol: string;
  overall: {
    /** 0-100，有 coverage 的面向等權平均後 ×4。 */
    score: number;
    signal: Signal;
  };
  faces: FaceLight[];
  /** 規則樣板生成的一句話總結。 */
  headline: string;
  /** 資料截止時間 (epoch ms)；無資料時 0。 */
  asOf: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 共用小工具 (純函式)
// ─────────────────────────────────────────────────────────────────────────────

/** 夾在 [lo, hi]。 */
export function clamp(x: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, x));
}

/** 不對稱門檻分類：> CHIP_BULLISH → bullish；< CHIP_BEARISH → bearish；其餘 neutral。 */
export function classifySignal(value: number): Signal {
  if (value > CHIP_BULLISH) return "bullish";
  if (value < CHIP_BEARISH) return "bearish";
  return "neutral";
}

/** [-1,1] 方向訊號 → [0,25] 面向分數 (neutral=12.5)。 */
export function signalToScore(value: number): number {
  return FACE_NEUTRAL_SCORE + clamp(value) * FACE_NEUTRAL_SCORE;
}

/** 無資料時的中性燈 (coverage=false)。 */
function neutralFace(face: FaceName, reason: string): FaceLight {
  return {
    face,
    signal: "neutral",
    score: FACE_NEUTRAL_SCORE,
    coverage: false,
    reasons: [reason],
  };
}

/** 把已算好的 signal value + reasons 包成 FaceLight (coverage=true)。 */
function lightFromValue(
  face: FaceName,
  value: number,
  reasons: string[],
): FaceLight {
  return {
    face,
    signal: classifySignal(value),
    score: signalToScore(value),
    coverage: true,
    reasons,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 基本面 (移植 score.py：獲利 / 成長 / 體質 / 估值四類投票 → 此處併入 fundamental)
// ─────────────────────────────────────────────────────────────────────────────

/** 基本面輸入：已解析好的財務數字 (任一缺值傳 null)。 */
export interface FundamentalInput {
  /** 每股盈餘 (元)。>0 獲利、<0 虧損。 */
  eps: number | null;
  /** 營收年增率 % (yoy)。 */
  revenueYoyPct: number | null;
  /** 股東權益報酬率 % (ROE)。 */
  roePct: number | null;
  /** 負債比 % = 負債總額 / 資產總額 × 100。 */
  debtRatioPct: number | null;
}

/**
 * 基本面評分：四項各投一票 (+1 好 / -1 差 / 0 中性或缺)，加總後 ÷4 正規化成 [-1,1]。
 * - EPS > 0 → +1，< 0 → -1
 * - 營收年增 > 10% → +1，< 0% → -1
 * - ROE > 15% → +1，< 5% → -1
 * - 負債比 < 40% → +1，> 70% → -1 (反向，越低越好)
 * 全缺 → coverage=false。
 */
export function scoreFundamental(input: FundamentalInput): FaceLight {
  const votes: number[] = [];
  const reasons: string[] = [];

  if (input.eps != null) {
    if (input.eps > 0) {
      votes.push(1);
      reasons.push(`EPS ${input.eps.toFixed(2)} 元（獲利）`);
    } else if (input.eps < 0) {
      votes.push(-1);
      reasons.push(`EPS ${input.eps.toFixed(2)} 元（虧損）`);
    } else {
      votes.push(0);
      reasons.push("EPS 損益兩平");
    }
  }

  if (input.revenueYoyPct != null) {
    if (input.revenueYoyPct > 10) {
      votes.push(1);
      reasons.push(`營收年增 ${input.revenueYoyPct.toFixed(1)}%`);
    } else if (input.revenueYoyPct < 0) {
      votes.push(-1);
      reasons.push(`營收年減 ${Math.abs(input.revenueYoyPct).toFixed(1)}%`);
    } else {
      votes.push(0);
      reasons.push(`營收年增 ${input.revenueYoyPct.toFixed(1)}%`);
    }
  }

  if (input.roePct != null) {
    if (input.roePct > 15) {
      votes.push(1);
      reasons.push(`ROE ${input.roePct.toFixed(1)}%`);
    } else if (input.roePct < 5) {
      votes.push(-1);
      reasons.push(`ROE 偏低 ${input.roePct.toFixed(1)}%`);
    } else {
      votes.push(0);
      reasons.push(`ROE ${input.roePct.toFixed(1)}%`);
    }
  }

  if (input.debtRatioPct != null) {
    if (input.debtRatioPct < 40) {
      votes.push(1);
      reasons.push(`負債比 ${input.debtRatioPct.toFixed(1)}%（穩健）`);
    } else if (input.debtRatioPct > 70) {
      votes.push(-1);
      reasons.push(`負債比偏高 ${input.debtRatioPct.toFixed(1)}%`);
    } else {
      votes.push(0);
      reasons.push(`負債比 ${input.debtRatioPct.toFixed(1)}%`);
    }
  }

  if (votes.length === 0) return neutralFace("fundamental", "無基本面資料");

  const value = clamp(votes.reduce((a, b) => a + b, 0) / votes.length);
  return lightFromValue("fundamental", value, reasons);
}

// ─────────────────────────────────────────────────────────────────────────────
// 籌碼面 (移植 score_chips.py：外資.30/投信.20/自營.10/融資.20/融券.10)
// ─────────────────────────────────────────────────────────────────────────────

/** 籌碼面輸入：近 N 日 (新→舊) 法人淨買賣 (張) + 融資融券快照。 */
export interface ChipInput {
  /** 外資每日淨買賣 (張)，index 0 = 最近日。 */
  foreignNet: ReadonlyArray<number | null>;
  /** 投信每日淨買賣 (張)。 */
  trustNet: ReadonlyArray<number | null>;
  /** 自營商每日淨買賣 (張)。 */
  dealerNet: ReadonlyArray<number | null>;
  /** 融資餘額每日序列 (張)，index 0 = 最近日 (用於算 5 日變化)。 */
  marginBalance: ReadonlyArray<number | null>;
  /** 最近一日融券餘額 (張)。 */
  shortBalance: number | null;
  /** 近 5 日股價漲跌幅 % (融資反指標判讀用)。 */
  priceChangePct: number | null;
}

/** 各籌碼子項權重 (對齊 plugin)。 */
const CHIP_WEIGHTS = {
  foreign: 0.3,
  trust: 0.2,
  dealer: 0.1,
  margin: 0.2,
  short: 0.1,
} as const;

/** 自營商小量門檻 (張)：5 日累積淨額絕對值小於此忽略。500_000 股 = 500 張。 */
const DEALER_NOISE_LOTS = 500;

/** 近 n 日累積 (跳過 null)。回 null 表示全缺。 */
function net5(series: ReadonlyArray<number | null>, n = 5): number | null {
  const vals = series.slice(0, n).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0);
}

/** 近 n 日是否連續同向：+1 連買 / -1 連賣 / 0 混合或不足。 */
function consecutive(series: ReadonlyArray<number | null>, n: number): number {
  const vals = series.slice(0, n);
  if (vals.length < n || vals.some((v) => v == null)) return 0;
  const nums = vals as number[];
  if (nums.every((v) => v > 0)) return 1;
  if (nums.every((v) => v < 0)) return -1;
  return 0;
}

/** 外資子項 [-1,1]：5 日累淨方向 × 連續性加成。 */
function scoreForeign(input: ChipInput): { s: number; desc: string } | null {
  const n5 = net5(input.foreignNet);
  if (n5 == null) return null;
  const cons = consecutive(input.foreignNet, 5);
  let s = 0;
  if (n5 > 0 && cons === 1) s = 1;
  else if (n5 > 0) s = 0.5;
  else if (n5 < 0 && cons === -1) s = -1;
  else if (n5 < 0) s = -0.5;
  const trend = cons === 1 ? "連買" : cons === -1 ? "連賣" : "混合";
  return { s, desc: `外資 5 日累淨 ${formatLots(n5)} 張（${trend}）` };
}

/** 投信子項 [-1,1]。 */
function scoreTrust(input: ChipInput): { s: number; desc: string } | null {
  const n5 = net5(input.trustNet);
  if (n5 == null) return null;
  const cons = consecutive(input.trustNet, 3);
  let s = 0.5 * (n5 > 0 ? 1 : n5 < 0 ? -1 : 0);
  if (cons === 1) s = Math.min(1, s + 0.5);
  else if (cons === -1) s = Math.max(-1, s - 0.5);
  return { s, desc: `投信 5 日累淨 ${formatLots(n5)} 張` };
}

/** 自營商子項 [-1,1]：小量忽略。 */
function scoreDealer(input: ChipInput): { s: number; desc: string } | null {
  const n5 = net5(input.dealerNet);
  if (n5 == null) return null;
  if (Math.abs(n5) < DEALER_NOISE_LOTS) {
    return { s: 0, desc: `自營商 5 日累淨 ${formatLots(n5)} 張（小量）` };
  }
  return { s: n5 > 0 ? 0.5 : -0.5, desc: `自營商 5 日累淨 ${formatLots(n5)} 張` };
}

/** 融資子項 [-1,1]：反向指標 (散戶追高 → 警訊)。需 ≥2 日餘額。 */
function scoreMargin(input: ChipInput): { s: number; desc: string } | null {
  const mb = input.marginBalance.filter((v): v is number => v != null);
  if (mb.length < 2) return null;
  const now = mb[0] as number;
  const ago = mb[Math.min(4, mb.length - 1)] as number;
  const chg = ago ? (now - ago) / ago : 0;
  const priceChg = input.priceChangePct ?? 0;
  let s = 0;
  if (chg > 0.2 && priceChg < 5) s = -1;
  else if (chg > 0.1) s = -0.5;
  else if (chg < -0.1 && priceChg > 0) s = 0.5;
  return {
    s,
    desc: `融資 5 日變化 ${(chg * 100).toFixed(1)}%，股價 ${priceChg.toFixed(1)}%`,
  };
}

/** 融券子項 [-1,1]：券資比高 → 軋空條件 (偏多)。 */
function scoreShort(input: ChipInput): { s: number; desc: string } | null {
  const mb = input.marginBalance.find((v) => v != null) ?? null;
  if (mb == null || input.shortBalance == null) return null;
  if (mb === 0) return { s: 0, desc: "無融資" };
  const ratio = input.shortBalance / mb;
  if (ratio > 0.3) {
    return { s: 0.5, desc: `券資比 ${(ratio * 100).toFixed(1)}%（軋空條件）` };
  }
  return { s: 0, desc: `券資比 ${(ratio * 100).toFixed(1)}%` };
}

function formatLots(n: number): string {
  return `${n >= 0 ? "+" : ""}${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * 籌碼面評分：5 子項加權 [-1,1]。**單日 degrade**：任一子項缺料則跳過，
 * 並對其餘有資料的子項權重重正規化 (不以 0 稀釋)。全缺 → coverage=false。
 */
export function scoreChip(input: ChipInput): FaceLight {
  const parts: Array<{ s: number; desc: string; w: number }> = [];
  const f = scoreForeign(input);
  if (f) parts.push({ ...f, w: CHIP_WEIGHTS.foreign });
  const t = scoreTrust(input);
  if (t) parts.push({ ...t, w: CHIP_WEIGHTS.trust });
  const d = scoreDealer(input);
  if (d) parts.push({ ...d, w: CHIP_WEIGHTS.dealer });
  const m = scoreMargin(input);
  if (m) parts.push({ ...m, w: CHIP_WEIGHTS.margin });
  const sh = scoreShort(input);
  if (sh) parts.push({ ...sh, w: CHIP_WEIGHTS.short });

  if (parts.length === 0) return neutralFace("chip", "無籌碼面資料");

  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const value = clamp(parts.reduce((a, p) => a + p.s * p.w, 0) / wsum);
  return lightFromValue("chip", value, parts.map((p) => p.desc));
}

// ─────────────────────────────────────────────────────────────────────────────
// 技術面 (移植 ensemble.py 精簡：EMA 排列 + RSI + 動能)
// ─────────────────────────────────────────────────────────────────────────────

/** 技術面用的最小 Candle 形狀 (只需收盤序列；對齊 domain Candle.close)。 */
export interface PriceBar {
  close: number;
}

/** RSI 計算的回看期。 */
const RSI_PERIOD = 14;
/** 動能用的回看交易日 (約一個月)。 */
const MOMENTUM_LOOKBACK = 21;

/** 指數移動平均 (最後一根)。series 由舊→新。 */
export function ema(values: readonly number[], span: number): number {
  if (values.length === 0) return Number.NaN;
  const k = 2 / (span + 1);
  let e = values[0] as number;
  for (let i = 1; i < values.length; i++) {
    e = (values[i] as number) * k + e * (1 - k);
  }
  return e;
}

/** Wilder 風格 RSI (最後一根)，回 [0,100]；不足期回 NaN。 */
export function rsi(values: readonly number[], period = RSI_PERIOD): number {
  if (values.length <= period) return Number.NaN;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = (values[i] as number) - (values[i - 1] as number);
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const diff = (values[i] as number) - (values[i - 1] as number);
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * 技術面評分：EMA 排列 (8/21/55 多頭排列 → 偏多) + RSI 區間 + 近月動能。
 * 三訊號各 [-1,1] 平均。Candle 不足 (< RSI_PERIOD+2) → coverage=false。
 */
export function scoreTechnical(bars: readonly PriceBar[]): FaceLight {
  if (bars.length < RSI_PERIOD + 2) {
    return neutralFace("technical", "日K資料不足");
  }
  const closes = bars.map((b) => b.close);
  const reasons: string[] = [];

  // EMA 多頭/空頭排列
  const e8 = ema(closes, 8);
  const e21 = ema(closes, 21);
  const e55 = ema(closes, 55);
  let trendSig = 0;
  if (e8 > e21 && e21 > e55) {
    trendSig = 1;
    reasons.push("均線多頭排列（EMA8>21>55）");
  } else if (e8 < e21 && e21 < e55) {
    trendSig = -1;
    reasons.push("均線空頭排列（EMA8<21<55）");
  } else {
    reasons.push("均線糾結");
  }

  // RSI：>70 過熱偏空、<30 超賣偏多、其餘以 50 為中心線性
  const r = rsi(closes);
  let rsiSig = 0;
  if (r > 70) {
    rsiSig = -0.5;
    reasons.push(`RSI ${r.toFixed(0)}（過熱）`);
  } else if (r < 30) {
    rsiSig = 0.5;
    reasons.push(`RSI ${r.toFixed(0)}（超賣）`);
  } else {
    rsiSig = clamp((r - 50) / 50);
    reasons.push(`RSI ${r.toFixed(0)}`);
  }

  // 動能：近一個月報酬率，放大後夾住
  const last = closes[closes.length - 1] as number;
  const prevIdx = closes.length - 1 - MOMENTUM_LOOKBACK;
  let momSig = 0;
  if (prevIdx >= 0) {
    const prev = closes[prevIdx] as number;
    const ret = prev ? (last - prev) / prev : 0;
    momSig = clamp(Math.sign(ret) * Math.min(Math.abs(ret) * 5, 1));
    reasons.push(`近月動能 ${(ret * 100).toFixed(1)}%`);
  }

  const value = clamp((trendSig + rsiSig + momSig) / 3);
  return lightFromValue("technical", value, reasons);
}

// ─────────────────────────────────────────────────────────────────────────────
// 估值面 (移植 score.py score_valuation：高 PE/PB → 貴 → bearish；高殖利率 → bullish)
// ─────────────────────────────────────────────────────────────────────────────

/** 估值面輸入：當前 PE/PB/殖利率% (任一缺傳 null；PE 空字串應已轉 null)。 */
export interface ValuationInput {
  pe: number | null;
  pb: number | null;
  /** 殖利率 % (已是百分比數值，如 3.31)。 */
  dividendYieldPct: number | null;
}

/**
 * 估值面評分：投票制 (反向——越貴越偏空)。
 * - PE > 25 → -1，PE < 12 → +1
 * - PB > 3 → -1，PB < 1 → +1
 * - 殖利率 > 5% → +1，< 1% → -1
 * PE 為 null (空字串/虧損) → 該項略過。全缺 → coverage=false。
 */
export function scoreValuation(input: ValuationInput): FaceLight {
  const votes: number[] = [];
  const reasons: string[] = [];

  if (input.pe != null) {
    if (input.pe > 25) {
      votes.push(-1);
      reasons.push(`本益比偏高 ${input.pe.toFixed(1)}`);
    } else if (input.pe < 12) {
      votes.push(1);
      reasons.push(`本益比偏低 ${input.pe.toFixed(1)}`);
    } else {
      votes.push(0);
      reasons.push(`本益比 ${input.pe.toFixed(1)}`);
    }
  }

  if (input.pb != null) {
    if (input.pb > 3) {
      votes.push(-1);
      reasons.push(`股價淨值比偏高 ${input.pb.toFixed(2)}`);
    } else if (input.pb < 1) {
      votes.push(1);
      reasons.push(`股價淨值比偏低 ${input.pb.toFixed(2)}`);
    } else {
      votes.push(0);
      reasons.push(`股價淨值比 ${input.pb.toFixed(2)}`);
    }
  }

  if (input.dividendYieldPct != null) {
    if (input.dividendYieldPct > 5) {
      votes.push(1);
      reasons.push(`殖利率 ${input.dividendYieldPct.toFixed(2)}%（高）`);
    } else if (input.dividendYieldPct < 1) {
      votes.push(-1);
      reasons.push(`殖利率偏低 ${input.dividendYieldPct.toFixed(2)}%`);
    } else {
      votes.push(0);
      reasons.push(`殖利率 ${input.dividendYieldPct.toFixed(2)}%`);
    }
  }

  if (votes.length === 0) return neutralFace("valuation", "無估值面資料");

  const value = clamp(votes.reduce((a, b) => a + b, 0) / votes.length);
  return lightFromValue("valuation", value, reasons);
}

// ─────────────────────────────────────────────────────────────────────────────
// 綜合合成
// ─────────────────────────────────────────────────────────────────────────────

const FACE_LABEL: Record<FaceName, string> = {
  fundamental: "基本面",
  chip: "籌碼面",
  technical: "技術面",
  valuation: "估值面",
};

const SIGNAL_LABEL: Record<Signal, string> = {
  bullish: "偏多",
  neutral: "中性",
  bearish: "偏空",
};

/**
 * 規則樣板生成標題 (非 LLM)：依 overall 燈號 + 最強/最弱面向組句。
 * 語意與燈號一致；無任何 coverage 時回保底字串。
 */
export function buildHeadline(
  overall: { score: number; signal: Signal },
  faces: readonly FaceLight[],
): string {
  const covered = faces.filter((f) => f.coverage);
  if (covered.length === 0) return "資料累積中，暫無綜合評等";

  const sorted = [...covered].sort((a, b) => b.score - a.score);
  const best = sorted[0] as FaceLight;
  const worst = sorted[sorted.length - 1] as FaceLight;
  const head = `綜合${SIGNAL_LABEL[overall.signal]}（${Math.round(overall.score)} 分）`;

  if (best.face === worst.face) {
    return `${head}，${FACE_LABEL[best.face]}${SIGNAL_LABEL[best.signal]}`;
  }
  return (
    `${head}，${FACE_LABEL[best.face]}最強（${SIGNAL_LABEL[best.signal]}）、` +
    `${FACE_LABEL[worst.face]}最弱（${SIGNAL_LABEL[worst.signal]}）`
  );
}

/**
 * 合成四面向 → HealthLights。只有 coverage=true 的面向計入 overall：
 * 取其 score (0-25) 平均後 ×4 → [0,100]，並依等效 [-1,1] 重新分類 signal。
 * 缺面向不以中性稀釋 (重正規化)。全缺 → overall 50/neutral + 累積中標題。
 */
export function combineHealthLights(
  symbol: string,
  faces: readonly FaceLight[],
  asOf: number,
): HealthLights {
  const covered = faces.filter((f) => f.coverage);

  let overallScore: number;
  let overallSignal: Signal;
  if (covered.length === 0) {
    overallScore = 50;
    overallSignal = "neutral";
  } else {
    const avgFace =
      covered.reduce((a, f) => a + f.score, 0) / covered.length; // 0-25
    overallScore = avgFace * 4; // 0-100
    // 還原成 [-1,1] 以套用相同不對稱門檻
    const value = (avgFace - FACE_NEUTRAL_SCORE) / FACE_NEUTRAL_SCORE;
    overallSignal = classifySignal(value);
  }

  const overall = { score: overallScore, signal: overallSignal };
  return {
    symbol,
    overall,
    faces: [...faces],
    headline: buildHeadline(overall, faces),
    asOf,
  };
}
