import { describe, expect, it } from "vitest";

import {
  CHIP_BULLISH,
  CHIP_BEARISH,
  FACE_MAX_SCORE,
  clamp,
  classifySignal,
  signalToScore,
  ema,
  rsi,
  scoreFundamental,
  scoreChip,
  scoreTechnical,
  scoreValuation,
  combineHealthLights,
  buildHeadline,
  type FaceLight,
  type PriceBar,
} from "../src/domain/healthScore.js";

/** Build a rising/flat close-only bar series of length n. */
function bars(closes: number[]): PriceBar[] {
  return closes.map((close) => ({ close }));
}

describe("named threshold constants (C5/不變式)", () => {
  it("uses the asymmetric plugin thresholds", () => {
    expect(CHIP_BULLISH).toBe(0.1);
    expect(CHIP_BEARISH).toBe(-0.3);
    // 空方門檻比多方嚴格 (需更強證據)
    expect(Math.abs(CHIP_BEARISH)).toBeGreaterThan(Math.abs(CHIP_BULLISH));
  });
});

describe("clamp / classifySignal / signalToScore", () => {
  it("clamps into range", () => {
    expect(clamp(5)).toBe(1);
    expect(clamp(-5)).toBe(-1);
    expect(clamp(0.3)).toBe(0.3);
  });

  it("classifies on the asymmetric thresholds", () => {
    expect(classifySignal(0.11)).toBe("bullish");
    expect(classifySignal(0.1)).toBe("neutral"); // boundary: > 0.10 needed
    expect(classifySignal(0)).toBe("neutral");
    expect(classifySignal(-0.3)).toBe("neutral"); // boundary: < -0.30 needed
    expect(classifySignal(-0.31)).toBe("bearish");
  });

  it("maps signal value to 0-25 with neutral at 12.5", () => {
    expect(signalToScore(0)).toBe(12.5);
    expect(signalToScore(1)).toBe(FACE_MAX_SCORE);
    expect(signalToScore(-1)).toBe(0);
  });
});

describe("scoreFundamental", () => {
  it("all-good → bullish, high score", () => {
    const f = scoreFundamental({
      eps: 8.5,
      revenueYoyPct: 25,
      roePct: 22,
      debtRatioPct: 30,
    });
    expect(f.coverage).toBe(true);
    expect(f.signal).toBe("bullish");
    expect(f.score).toBe(FACE_MAX_SCORE); // 4/4 votes → value 1
    expect(f.reasons.length).toBe(4);
  });

  it("loss + shrinking revenue + weak ROE + high debt → bearish low score", () => {
    const f = scoreFundamental({
      eps: -1.2,
      revenueYoyPct: -15,
      roePct: 2,
      debtRatioPct: 85,
    });
    expect(f.signal).toBe("bearish");
    expect(f.score).toBe(0); // -4/4 → value -1
  });

  it("no inputs → coverage=false, neutral", () => {
    const f = scoreFundamental({
      eps: null,
      revenueYoyPct: null,
      roePct: null,
      debtRatioPct: null,
    });
    expect(f.coverage).toBe(false);
    expect(f.signal).toBe("neutral");
    expect(f.score).toBe(12.5);
  });
});

describe("scoreChip", () => {
  const baseFlat = {
    foreignNet: [] as Array<number | null>,
    trustNet: [] as Array<number | null>,
    dealerNet: [] as Array<number | null>,
    marginBalance: [] as Array<number | null>,
    shortBalance: null as number | null,
    priceChangePct: null as number | null,
  };

  it("外資連買 + 投信買 → bullish", () => {
    const f = scoreChip({
      ...baseFlat,
      foreignNet: [500, 400, 300, 200, 100], // 5 日連買
      trustNet: [100, 80, 60, 40, 20], // 連買
    });
    expect(f.coverage).toBe(true);
    expect(f.signal).toBe("bullish");
    expect(f.score).toBeGreaterThan(12.5);
  });

  it("融資暴增股價滯漲 → bearish 子項", () => {
    const f = scoreChip({
      ...baseFlat,
      // 融資 5 日 +25% 而股價僅 +1% → 強烈 bearish
      marginBalance: [12500, 11000, 10500, 10200, 10000],
      shortBalance: 50,
      priceChangePct: 1,
    });
    expect(f.coverage).toBe(true);
    // 只有 margin(+short) 子項，margin = -1 主導 → bearish
    expect(f.signal).toBe("bearish");
  });

  it("單日 degrade：缺料子項跳過並重正規化 (純外資資料不被 0 稀釋)", () => {
    // 只有外資資料，5 日連買 → foreign s=1。重正規化後 value 應 = 1 (非 0.3)。
    const f = scoreChip({
      ...baseFlat,
      foreignNet: [500, 400, 300, 200, 100],
    });
    expect(f.coverage).toBe(true);
    expect(f.score).toBe(FACE_MAX_SCORE); // value=1 → 25
    expect(f.signal).toBe("bullish");
  });

  it("全缺 → coverage=false neutral", () => {
    const f = scoreChip({ ...baseFlat });
    expect(f.coverage).toBe(false);
    expect(f.signal).toBe("neutral");
    expect(f.score).toBe(12.5);
  });

  it("自營商小量被忽略 (不影響方向)", () => {
    const f = scoreChip({
      ...baseFlat,
      dealerNet: [100, 50, 50, 50, 50], // 累 300 張 < 500 門檻
    });
    // 唯一子項 dealer s=0 → neutral
    expect(f.coverage).toBe(true);
    expect(f.signal).toBe("neutral");
  });
});

describe("ema / rsi pure helpers", () => {
  it("ema of constant series equals the constant", () => {
    expect(ema([10, 10, 10, 10], 3)).toBeCloseTo(10, 6);
  });

  it("rsi of monotonically rising series → 100", () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(rising)).toBe(100);
  });

  it("rsi returns NaN when not enough data", () => {
    expect(Number.isNaN(rsi([1, 2, 3]))).toBe(true);
  });
});

describe("scoreTechnical", () => {
  it("strong uptrend (EMA bull stack, rising momentum) → bullish", () => {
    const f = scoreTechnical(bars(Array.from({ length: 60 }, (_, i) => 100 + i * 2)));
    expect(f.coverage).toBe(true);
    expect(f.signal).toBe("bullish");
    expect(f.score).toBeGreaterThan(12.5);
  });

  it("strong downtrend → bearish", () => {
    const f = scoreTechnical(bars(Array.from({ length: 60 }, (_, i) => 200 - i * 2)));
    expect(f.coverage).toBe(true);
    expect(f.signal).toBe("bearish");
    expect(f.score).toBeLessThan(12.5);
  });

  it("too few candles → coverage=false", () => {
    const f = scoreTechnical(bars([100, 101, 102]));
    expect(f.coverage).toBe(false);
    expect(f.signal).toBe("neutral");
  });
});

describe("scoreValuation", () => {
  it("high PE + high PB → bearish", () => {
    const f = scoreValuation({ pe: 40, pb: 5, dividendYieldPct: 0.5 });
    expect(f.coverage).toBe(true);
    expect(f.signal).toBe("bearish");
    expect(f.score).toBeLessThan(12.5);
  });

  it("high dividend yield + cheap multiples → bullish", () => {
    const f = scoreValuation({ pe: 8, pb: 0.8, dividendYieldPct: 6.5 });
    expect(f.signal).toBe("bullish");
    expect(f.score).toBeGreaterThan(12.5);
  });

  it("PEratio null (虧損/空字串) is skipped, others still counted", () => {
    const f = scoreValuation({ pe: null, pb: 5, dividendYieldPct: 0.5 });
    expect(f.coverage).toBe(true);
    // pb=-1, yield=-1 → value -1 → bearish；PE 不計入
    expect(f.reasons.every((r) => !r.includes("本益比"))).toBe(true);
  });

  it("all null → coverage=false", () => {
    const f = scoreValuation({ pe: null, pb: null, dividendYieldPct: null });
    expect(f.coverage).toBe(false);
    expect(f.signal).toBe("neutral");
  });
});

describe("combineHealthLights", () => {
  function face(
    over: Partial<FaceLight> & Pick<FaceLight, "face" | "score" | "coverage">,
  ): FaceLight {
    return {
      signal: "neutral",
      reasons: [],
      ...over,
    } as FaceLight;
  }

  it("four covered faces → overall 0-100 = avg face × 4", () => {
    const faces: FaceLight[] = [
      face({ face: "fundamental", score: 25, coverage: true, signal: "bullish" }),
      face({ face: "chip", score: 25, coverage: true, signal: "bullish" }),
      face({ face: "technical", score: 25, coverage: true, signal: "bullish" }),
      face({ face: "valuation", score: 25, coverage: true, signal: "bullish" }),
    ];
    const h = combineHealthLights("2330", faces, 1700000000000);
    expect(h.overall.score).toBe(100);
    expect(h.overall.signal).toBe("bullish");
    expect(h.symbol).toBe("2330");
    expect(h.asOf).toBe(1700000000000);
  });

  it("missing face is renormalized (not diluted by neutral)", () => {
    // 一個 bullish(25) + 三個缺面向 → overall 應 = 25×4 = 100，而非被 0 稀釋
    const faces: FaceLight[] = [
      face({ face: "fundamental", score: 25, coverage: true, signal: "bullish" }),
      face({ face: "chip", score: 12.5, coverage: false }),
      face({ face: "technical", score: 12.5, coverage: false }),
      face({ face: "valuation", score: 12.5, coverage: false }),
    ];
    const h = combineHealthLights("2330", faces, 0);
    expect(h.overall.score).toBe(100);
    expect(h.overall.signal).toBe("bullish");
  });

  it("all faces missing → overall 50 neutral + 累積中 headline", () => {
    const faces: FaceLight[] = [
      face({ face: "fundamental", score: 12.5, coverage: false }),
      face({ face: "chip", score: 12.5, coverage: false }),
      face({ face: "technical", score: 12.5, coverage: false }),
      face({ face: "valuation", score: 12.5, coverage: false }),
    ];
    const h = combineHealthLights("9999", faces, 0);
    expect(h.overall.score).toBe(50);
    expect(h.overall.signal).toBe("neutral");
    expect(h.headline).toContain("累積中");
  });
});

describe("buildHeadline", () => {
  function f(
    face: FaceLight["face"],
    score: number,
    signal: FaceLight["signal"],
    coverage = true,
    reasons: string[] = [],
  ): FaceLight {
    return { face, score, signal, coverage, reasons };
  }

  it("builds a per-face narrative carrying each covered face's reasons + overall verdict", () => {
    const faces = [
      f("fundamental", 24, "bullish", true, ["EPS 1.94 元（獲利）", "營收年增 9%"]),
      f("chip", 6, "bearish", true, ["外資 5 日累淨 -11,057 張（連賣）"]),
      f("technical", 21, "bullish", true, ["均線多頭排列（EMA8>21>55）", "RSI 68"]),
      f("valuation", 13, "neutral", true, ["本益比偏低 8.0"]),
    ];
    const h = buildHeadline({ score: 64, signal: "neutral" }, faces);
    // each face's numeric reasons surface verbatim
    expect(h).toContain("EPS 1.94 元（獲利）");
    expect(h).toContain("外資 5 日累淨 -11,057 張（連賣）");
    expect(h).toContain("均線多頭排列（EMA8>21>55）");
    expect(h).toContain("本益比偏低 8.0");
    // closes with the overall verdict
    expect(h).toContain("整體中性（64 分）");
  });

  it("orders faces 基本面→籌碼面→技術面→估值面 regardless of input order", () => {
    const faces = [
      f("valuation", 13, "neutral", true, ["本益比 18"]),
      f("technical", 21, "bullish", true, ["均線多頭排列"]),
      f("chip", 6, "bearish", true, ["外資連賣"]),
      f("fundamental", 24, "bullish", true, ["EPS 1.94 元（獲利）"]),
    ];
    const h = buildHeadline({ score: 64, signal: "neutral" }, faces);
    const order = ["基本面", "籌碼面", "技術面", "估值面"].map((s) =>
      h.indexOf(s),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("a covered face with no reasons still names the face + its verdict", () => {
    const faces = [f("fundamental", 24, "bullish", true, [])];
    const h = buildHeadline({ score: 75, signal: "bullish" }, faces);
    expect(h).toContain("基本面偏多");
    expect(h).toContain("整體偏多（75 分）");
  });

  it("no coverage → fallback string", () => {
    const faces = [f("fundamental", 12.5, "neutral", false)];
    expect(buildHeadline({ score: 50, signal: "neutral" }, faces)).toContain(
      "累積中",
    );
  });
});
