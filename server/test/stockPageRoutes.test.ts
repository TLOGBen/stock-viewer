import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import express from "express";
import { createApiRouter, type ApiDeps } from "../src/action/index.js";
import { corsMiddleware, jsonBody } from "../src/middleware/index.js";
import type { StockPageDeps } from "../src/usecase/index.js";
import type {
  CompanyProfile,
  MonthlyRevenue,
  FinancialStatement,
  BalanceSheet,
  Dividend,
  InstitutionalFlow,
  MarginData,
  ValuationPoint,
  ExDividend,
  Disclosure,
} from "../src/domain/index.js";

/**
 * Integration test for the eight 個股頁 (stock-page) routes: mount the real
 * action router + middleware on a real express server, issue real HTTP requests,
 * and assert the 200 status + view shape for a known symbol and a uniform 400 for
 * an illegal symbol (validateSymbol guard). All stock-page deps are injected
 * fakes — no network, no real caches. The injected fakes return 1513's known
 * truths so the serialized views carry real numbers, not just structure.
 */

const SYMBOL = "1513";

const profile1513: CompanyProfile = {
  symbol: SYMBOL,
  shortName: "中興電",
  chairman: "",
  ceo: "",
  industryCode: "23", // 一般 (ci) — getFinancials takes the _ci path
  taxId: "",
  foundDate: "",
} as CompanyProfile;

const revenue1513: MonthlyRevenue = {
  yearMonth: "2026-05",
  revenueThousands: 2392022, // 千元 (known true value)
  momPct: null,
  yoyPct: 10,
  accYoyPct: null,
};

const fin1513: FinancialStatement = {
  period: "2026Q1",
  revenue: 6490639,
  grossProfit: 1685977,
  operatingIncome: 1203389,
  netIncome: 960263,
  eps: 1.94,
  variant: "ci",
} as FinancialStatement;

const bal1513: BalanceSheet = {
  period: "2026Q1",
  totalAssets: 48754126,
  totalLiab: 26877788,
  totalEquity: 21876338,
  bvps: 43.57,
} as BalanceSheet;

const div1513: Dividend = {
  year: "114",
  period: "1",
  cashDividend: 6.0,
  stockDividend: 0,
  resolutionDate: "1150310",
} as Dividend;

const flow1513: InstitutionalFlow = {
  foreignNet: 940,
  trustNet: 4369.58,
  dealerNet: -10,
  totalNet: 945.506, // 張 (known true value)
};

const margin1513: MarginData = {
  marginBalance: 10160, // 張 (known true value, not /1000)
  shortBalance: 89,
  shortMarginRatioPct: (89 / 10160) * 100,
};

const vp1513: ValuationPoint = {
  date: "1150624",
  pe: 22.48, // known true value
  pb: 4.25,
  dividendYieldPct: 3.31,
};

const ex1513: ExDividend = {
  date: Date.UTC(2026, 5, 24),
  refPriceBefore: 100,
  refPrice: 94,
  value: 6,
  kind: "息",
};

const disc1513: Disclosure = {
  symbol: SYMBOL,
  dateRoc: "1150624",
  date: Date.UTC(2026, 5, 24),
  time: "64502",
  subject: "公告本公司董事會決議發放現金股利",
  factDateRoc: "1150624",
};

/** Build a by-date cache stub whose recent window is a single known day. */
function dayCache<T>(value: T): { getRecentDays: () => Promise<{ date: string; map: Map<string, T> }[]> } {
  return {
    getRecentDays: async () => [
      { date: "20260624", map: new Map<string, T>([[SYMBOL, value]]) },
    ],
  };
}

/** Build the injected stock-page deps with 1513 known-truth fakes. */
function makeStockPageDeps(): StockPageDeps {
  return {
    provider: { get: () => ({ exch: "tse" }) } as unknown as StockPageDeps["provider"],
    company: async (s) => (s === SYMBOL ? profile1513 : null),
    revenue: {
      upsertLatest: async () => [revenue1513],
      getSeries: async () => [revenue1513],
    } as unknown as StockPageDeps["revenue"],
    financials: async (_s, v) => (v === "ci" ? fin1513 : null),
    balance: async (_s, v) => (v === "ci" ? bal1513 : null),
    dividends: async () => [div1513],
    institutional: dayCache(flow1513) as unknown as StockPageDeps["institutional"],
    margin: dayCache(margin1513) as unknown as StockPageDeps["margin"],
    valuation: dayCache(vp1513) as unknown as StockPageDeps["valuation"],
    valuationSeries: {
      upsertLatest: async () => [vp1513],
      getSeries: async () => [vp1513],
    } as unknown as StockPageDeps["valuationSeries"],
    exRight: dayCache(ex1513) as unknown as StockPageDeps["exRight"],
    disclosures: dayCache([disc1513]) as unknown as StockPageDeps["disclosures"],
    history: {
      getDaily: async () => [],
    } as unknown as StockPageDeps["history"],
  };
}

/** Minimal ApiDeps carrying the stock-page sub-object (other fields unused). */
function makeDeps(): ApiDeps {
  return {
    feed: {} as ApiDeps["feed"],
    provider: {} as ApiDeps["provider"],
    watchlist: {} as ApiDeps["watchlist"],
    positionBook: {} as ApiDeps["positionBook"],
    candleStore: {} as ApiDeps["candleStore"],
    historyCache: {} as ApiDeps["historyCache"],
    version: "9.9.9",
    stockPageDeps: makeStockPageDeps(),
  };
}

function startServer(): Promise<{ server: http.Server; port: number }> {
  const app = express();
  app.use(corsMiddleware());
  app.use(jsonBody());
  app.use("/api", createApiRouter(makeDeps()));
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

function getJson(
  port: number,
  path: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path }, (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: raw ? JSON.parse(raw) : null,
          }),
        );
      })
      .on("error", reject);
  });
}

describe("個股頁 routes (action + middleware + usecase integration)", () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    ({ server, port } = await startServer());
  });

  afterAll(() => {
    vi.restoreAllMocks();
    server.close();
  });

  it("GET /api/company/:symbol → 200 + the resolved profile", async () => {
    const { status, body } = await getJson(port, `/api/company/${SYMBOL}`);
    expect(status).toBe(200);
    const view = body as { symbol: string; coverage: boolean; profile: { symbol: string } | null };
    expect(view.symbol).toBe(SYMBOL);
    expect(view.coverage).toBe(true);
    expect(view.profile?.symbol).toBe(SYMBOL);
  });

  it("GET /api/revenue/:symbol → 200 + the accumulated series (千元)", async () => {
    const { status, body } = await getJson(port, `/api/revenue/${SYMBOL}`);
    expect(status).toBe(200);
    const view = body as { coverage: boolean; series: { revenueThousands: number }[] };
    expect(view.coverage).toBe(true);
    expect(view.series[0]!.revenueThousands).toBe(2392022);
  });

  it("GET /api/financials/:symbol → 200 + EPS and derived ROE/負債比", async () => {
    const { status, body } = await getJson(port, `/api/financials/${SYMBOL}`);
    expect(status).toBe(200);
    const view = body as {
      coverage: boolean;
      variant: string | null;
      statement: { eps: number } | null;
      roe: number | null;
      debtRatio: number | null;
    };
    expect(view.coverage).toBe(true);
    expect(view.variant).toBe("ci");
    expect(view.statement?.eps).toBe(1.94);
    expect(view.debtRatio).toBeCloseTo(26877788 / 48754126, 10);
    expect(view.roe).toBeCloseTo(960263 / 21876338, 10);
  });

  it("GET /api/dividends/:symbol → 200 + ap45 series + latest ex-dividend", async () => {
    const { status, body } = await getJson(port, `/api/dividends/${SYMBOL}`);
    expect(status).toBe(200);
    const view = body as {
      coverage: boolean;
      series: { cashDividend: number }[];
      exDividend: { kind: string } | null;
    };
    expect(view.coverage).toBe(true);
    expect(view.series[0]!.cashDividend).toBe(6.0);
    expect(view.exDividend?.kind).toBe("息");
  });

  it("GET /api/institutional/:symbol → 200 + 三大法人 張 (newest-first)", async () => {
    const { status, body } = await getJson(port, `/api/institutional/${SYMBOL}`);
    expect(status).toBe(200);
    const view = body as { coverage: boolean; days: { totalNet: number }[] };
    expect(view.coverage).toBe(true);
    expect(view.days[0]!.totalNet).toBeCloseTo(945.506, 3);
  });

  it("GET /api/disclosures/:symbol → 200 + official 重大訊息 (no view counts)", async () => {
    const { status, body } = await getJson(port, `/api/disclosures/${SYMBOL}`);
    expect(status).toBe(200);
    const view = body as { coverage: boolean; items: { subject: string }[] };
    expect(view.coverage).toBe(true);
    expect(view.items[0]!.subject).toContain("現金股利");
    expect(view.items[0]).not.toHaveProperty("viewCount");
  });

  it("GET /api/margin/:symbol → 200 + 餘額為張 (not /1000)", async () => {
    const { status, body } = await getJson(port, `/api/margin/${SYMBOL}`);
    expect(status).toBe(200);
    const view = body as { coverage: boolean; days: { marginBalance: number }[] };
    expect(view.coverage).toBe(true);
    expect(view.days[0]!.marginBalance).toBe(10160);
  });

  it("GET /api/valuation/:symbol → 200 + PE/PB band over the series", async () => {
    const { status, body } = await getJson(port, `/api/valuation/${SYMBOL}`);
    expect(status).toBe(200);
    const view = body as {
      coverage: boolean;
      series: { pe: number | null }[];
      pe: unknown;
      pb: unknown;
    };
    expect(view.coverage).toBe(true);
    expect(view.series[0]!.pe).toBe(22.48);
    expect(view.pe).not.toBeNull();
    expect(view.pb).not.toBeNull();
  });

  it("GET /api/health-lights/:symbol → 200 + the four-face headline", async () => {
    const { status, body } = await getJson(port, `/api/health-lights/${SYMBOL}`);
    expect(status).toBe(200);
    const view = body as { symbol: string; faces: unknown[] };
    expect(view.symbol).toBe(SYMBOL);
    expect(Array.isArray(view.faces)).toBe(true);
  });

  it("rejects an illegal symbol with a uniform 400 (validateSymbol guard)", async () => {
    for (const route of [
      "company",
      "revenue",
      "financials",
      "dividends",
      "institutional",
      "margin",
      "valuation",
      "health-lights",
    ]) {
      // A single route segment that fails SYMBOL_PATTERN (underscores) — matches
      // the :symbol route yet is rejected by validateSymbol with a uniform 400.
      const { status } = await getJson(port, `/api/${route}/__bad__`);
      expect(status).toBe(400);
    }
  });
});
