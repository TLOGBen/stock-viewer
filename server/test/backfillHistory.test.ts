import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { FinmindClient } from "../scripts/finmindClient.js";
import { mapPerRows, mapMonthRevenueRows } from "../scripts/finmindMapper.js";
import { runBackfill } from "../scripts/backfill-history.js";
import type { ValuationPoint } from "../src/domain/valuation.js";
import type { MonthlyRevenue } from "../src/domain/revenue.js";

/** Fixed FinMind-shaped PER rows (Gregorian dates, raw PER/PBR/yield). */
const PER_ROWS = [
  { date: "2026-03-02", PER: "20.0", PBR: "5.0", dividend_yield: "3.0" },
  { date: "2026-04-01", PER: "21.0", PBR: "5.1", dividend_yield: "3.1" },
  { date: "2026-05-04", PER: "22.0", PBR: "5.2", dividend_yield: "3.2" },
];

/** Fixed FinMind-shaped monthly-revenue rows (revenue in 元). */
const REV_ROWS = [
  { date: "2025-04-10", revenue: 1_000_000_000, revenue_year: 2025, revenue_month: 3 },
  { date: "2025-05-10", revenue: 1_100_000_000, revenue_year: 2025, revenue_month: 4 },
  { date: "2026-04-10", revenue: 2_000_000_000, revenue_year: 2026, revenue_month: 3 },
  { date: "2026-05-10", revenue: 2_200_000_000, revenue_year: 2026, revenue_month: 4 },
];

/** A fake client returning the same fixed rows for every symbol. */
function fakeClient(): FinmindClient {
  return {
    fetchPER: async () => [...PER_ROWS],
    fetchMonthRevenue: async () => [...REV_ROWS],
  };
}

async function readSeries<T>(
  dataDir: string,
  subDir: string,
  symbol: string,
): Promise<{ asOf: number; items: T[] }> {
  const raw = await fs.readFile(
    path.join(dataDir, subDir, `${symbol}.json`),
    "utf8",
  );
  return JSON.parse(raw) as { asOf: number; items: T[] };
}

describe("runBackfill", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "backfill-test-"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("writes valuation-series and revenue caches with the correct shape", async () => {
    await runBackfill({ client: fakeClient(), symbols: ["1513"], dataDir });

    const val = await readSeries<ValuationPoint>(dataDir, "valuation-series", "1513");
    expect(val.items).toEqual(mapPerRows(PER_ROWS));
    expect(typeof val.asOf).toBe("number");

    const rev = await readSeries<MonthlyRevenue>(dataDir, "revenue", "1513");
    expect(rev.items).toEqual(mapMonthRevenueRows(REV_ROWS));
  });

  it("is idempotent — running twice yields identical file contents", async () => {
    await runBackfill({ client: fakeClient(), symbols: ["1513"], dataDir });
    const val1 = await readSeries(dataDir, "valuation-series", "1513");
    const rev1 = await readSeries(dataDir, "revenue", "1513");

    await runBackfill({ client: fakeClient(), symbols: ["1513"], dataDir });
    const val2 = await readSeries(dataDir, "valuation-series", "1513");
    const rev2 = await readSeries(dataDir, "revenue", "1513");

    expect(val2.items).toEqual(val1.items);
    expect(rev2.items).toEqual(rev1.items);
  });

  it("resumable: a partial seed then a full seed converges to the single-full-run result", async () => {
    // Partial first run: an earlier client returns only the first two revenue
    // months and the first two PER rows.
    const partial: FinmindClient = {
      fetchPER: async () => PER_ROWS.slice(0, 2),
      fetchMonthRevenue: async () => REV_ROWS.slice(0, 2),
    };
    await runBackfill({ client: partial, symbols: ["1513"], dataDir });

    // Then a full run completes the rest.
    await runBackfill({ client: fakeClient(), symbols: ["1513"], dataDir });

    const rev = await readSeries<MonthlyRevenue>(dataDir, "revenue", "1513");
    const val = await readSeries<ValuationPoint>(dataDir, "valuation-series", "1513");

    // Final series must equal a single clean full run — derived percents (mom/
    // yoy/accYoy) are computed over the FULL series by the mapper each call, so
    // the merged result carries no per-write contamination.
    expect(rev.items).toEqual(mapMonthRevenueRows(REV_ROWS));
    expect(val.items).toEqual(mapPerRows(PER_ROWS));
  });

  it("does not abort the batch when one symbol's fetch throws", async () => {
    const flaky: FinmindClient = {
      fetchPER: async (symbol) => {
        if (symbol === "9999") throw new Error("boom");
        return [...PER_ROWS];
      },
      fetchMonthRevenue: async (symbol) => {
        if (symbol === "9999") throw new Error("boom");
        return [...REV_ROWS];
      },
    };

    await runBackfill({ client: flaky, symbols: ["9999", "1513"], dataDir });

    // 1513 still written despite 9999 failing.
    const val = await readSeries<ValuationPoint>(dataDir, "valuation-series", "1513");
    expect(val.items).toEqual(mapPerRows(PER_ROWS));
    const rev = await readSeries<MonthlyRevenue>(dataDir, "revenue", "1513");
    expect(rev.items).toEqual(mapMonthRevenueRows(REV_ROWS));

    // 9999 produced no files.
    await expect(
      fs.access(path.join(dataDir, "valuation-series", "9999.json")),
    ).rejects.toThrow();
  });
});
