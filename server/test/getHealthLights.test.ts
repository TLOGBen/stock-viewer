import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { getHealthLights } from "../src/usecase/index.js";
import {
  BulkByDateCache,
  SnapshotSeriesCache,
  HistoryCache,
} from "../src/persistence/index.js";
import type {
  StockPageDeps,
  FinancialsByVariantFetcher,
  BalanceByVariantFetcher,
  CompanyFetcher,
  DividendSeriesFetcher,
} from "../src/usecase/index.js";
import type {
  InstitutionalFlow,
  MarginData,
  ValuationPoint,
  ExDividend,
  MonthlyRevenue,
  FinancialStatement,
  BalanceSheet,
  Candle,
  CompanyProfile,
  Exch,
} from "../src/domain/index.js";
import { recentTradingDays } from "../src/domain/index.js";
import type { UniverseProvider } from "../src/usecase/universeService.js";

const NOW = new Date(Date.UTC(2026, 5, 24)); // Wednesday

// Date-varying margin stub (not a constant per-day map): the newest trading day
// carries the LOWEST 融資餘額 and the oldest the highest, i.e. 融資減少 over the
// window — which, with rising prices, is a healthy/bullish chip signal. This
// makes the chip score genuinely order-sensitive: if the newest↔oldest ordering
// were ever silently reversed (a real regression risk in the by-date sweep), the
// margin signal would flip to 融資暴增 (bearish) and these assertions would move.
const RECENT5 = recentTradingDays(NOW, 5); // newest-first
const MARGIN_BALANCE_BY_DATE = new Map(
  RECENT5.map((d, i) => [d, 10000 + i * 600] as const),
);

/** A stub provider that only answers `.get(symbol)?.exch`. */
function stubProvider(exch: Exch): UniverseProvider {
  return {
    get: () => ({ symbol: "1513", name: "中興電", type: "stock", exch }),
  } as unknown as UniverseProvider;
}

/** Build a rising daily candle series long enough for the technical face. */
function risingDaily(n: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const close = 100 + i; // monotonic up → bullish EMA stack
    out.push({ timestamp: i * 86400000, open: close, high: close, low: close, close, volume: 1000 });
  }
  return out;
}

/** Options to selectively break a face source. */
interface Opts {
  exch?: Exch;
  dailyLen?: number;
  breakTechnical?: boolean;
}

/** Assemble a full StockPageDeps over real caches + fakes for a healthy 1513. */
async function makeDeps(dataDir: string, opts: Opts = {}): Promise<StockPageDeps> {
  const exch = opts.exch ?? "tse";

  const company: CompanyFetcher = async (): Promise<CompanyProfile> => ({
    symbol: "1513",
    shortName: "中興電",
    chairman: "江義福",
    ceo: "謝裕雄",
    industryCode: "05",
    taxId: "11719009",
    foundDate: "19560501",
    listDate: "19730802",
    website: "",
    transferAgent: "",
  });

  const fin1513: FinancialStatement = {
    period: "2026Q1",
    revenue: 6490639,
    grossProfit: 1685977,
    operatingIncome: 1203389,
    netIncome: 960263,
    eps: 1.94,
    variant: "ci",
  };
  const financials: FinancialsByVariantFetcher = async (_s, v) =>
    v === "ci" ? fin1513 : null;

  const bal1513: BalanceSheet = {
    period: "2026Q1",
    totalAssets: 48754126,
    totalLiab: 26877788,
    totalEquity: 21876338,
    bvps: 43.57,
  };
  const balance: BalanceByVariantFetcher = async () => bal1513;

  const dividends: DividendSeriesFetcher = async () => [];

  const revFetch = async (): Promise<MonthlyRevenue> => ({
    yearMonth: "2026-05",
    revenueThousands: 2392022,
    momPct: 3.65,
    yoyPct: 12.5, // > 10 → bullish revenue vote
    accYoyPct: 5.1,
  });
  const revenue = new SnapshotSeriesCache(
    dataDir,
    "revenue",
    (r: MonthlyRevenue) => r.yearMonth,
    24,
    revFetch,
  );
  await revenue.upsertLatest("1513"); // seed the series

  // Foreign+trust buying every day → bullish chip.
  const institutional = new BulkByDateCache<InstitutionalFlow>(
    dataDir,
    "t86",
    async () =>
      new Map([
        ["1513", { foreignNet: 1000, trustNet: 500, dealerNet: 100, totalNet: 1600 }],
      ]),
    0,
  );

  const margin = new BulkByDateCache<MarginData>(
    dataDir,
    "margin",
    async (date) => {
      const marginBalance = MARGIN_BALANCE_BY_DATE.get(date) ?? 10000;
      return new Map([
        [
          "1513",
          {
            marginBalance,
            shortBalance: 89,
            shortMarginRatioPct: (89 / marginBalance) * 100,
          },
        ],
      ]);
    },
    0,
  );

  const valuation = new BulkByDateCache<ValuationPoint>(
    dataDir,
    "bwibbu",
    async () =>
      new Map([
        ["1513", { date: "1150624", pe: 22.48, pb: 4.25, dividendYieldPct: 3.24 }],
      ]),
    0,
  );

  const exRight = new BulkByDateCache<ExDividend>(
    dataDir,
    "twt49u",
    async () => new Map(),
    0,
  );

  const dailyLen = opts.dailyLen ?? 60;
  const fetchDaily = async (): Promise<Candle[]> => {
    if (opts.breakTechnical) throw new Error("history boom");
    return exch === "otc" ? [] : risingDaily(dailyLen);
  };
  const history = new HistoryCache(dataDir, fetchDaily);

  return {
    provider: stubProvider(exch),
    company,
    revenue,
    financials,
    balance,
    dividends,
    institutional,
    margin,
    valuation,
    exRight,
    history,
  };
}

describe("usecase/getHealthLights", () => {
  let dataDir: string;
  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "hl-test-"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("assembles four covered faces into a complete HealthLights shape", async () => {
    const deps = await makeDeps(dataDir);
    const hl = await getHealthLights(deps, "1513", NOW);

    expect(hl.symbol).toBe("1513");
    expect(hl.faces.map((f) => f.face)).toEqual([
      "fundamental",
      "chip",
      "technical",
      "valuation",
    ]);
    // All four sources present → all covered.
    expect(hl.faces.every((f) => f.coverage)).toBe(true);
    expect(hl.overall.score).toBeGreaterThan(0);
    expect(hl.overall.score).toBeLessThanOrEqual(100);
    expect(hl.headline.length).toBeGreaterThan(0);
    expect(hl.asOf).toBe(NOW.getTime());
  });

  it("a thrown face source → that face coverage:false + neutral, others stay covered, never throws", async () => {
    const deps = await makeDeps(dataDir, { breakTechnical: true });
    const hl = await getHealthLights(deps, "1513", NOW);

    const technical = hl.faces.find((f) => f.face === "technical")!;
    expect(technical.coverage).toBe(false);
    expect(technical.signal).toBe("neutral");
    // The other three faces still resolved.
    const others = hl.faces.filter((f) => f.face !== "technical");
    expect(others.every((f) => f.coverage)).toBe(true);
    // overall is re-normalized over the covered faces only — still a real score.
    expect(hl.overall.score).toBeGreaterThan(0);
  });

  it("OTC empty daily → technical coverage:false (空圖降級), still emits a headline", async () => {
    const deps = await makeDeps(dataDir, { exch: "otc" });
    const hl = await getHealthLights(deps, "6488", NOW);
    const technical = hl.faces.find((f) => f.face === "technical")!;
    expect(technical.coverage).toBe(false);
    expect(hl.headline.length).toBeGreaterThan(0);
  });
});
