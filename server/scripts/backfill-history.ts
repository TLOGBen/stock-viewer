/**
 * scripts/backfill-history — BUILD-TIME ONLY seed CLI.
 *
 * Backfills per-symbol PE/PB (估值河流圖) and monthly-revenue history into the
 * SAME on-disk caches the runtime reads ({dataDir}/valuation-series/{symbol}.json
 * and {dataDir}/revenue/{symbol}.json), so the 個股頁 shows a long series on load
 * instead of the「累積中」cold-start state. The official runtime upsert later
 * folds fresh days/months into the very same files.
 *
 * Usage:
 *   npx tsx server/scripts/backfill-history.ts 2330 1513
 *
 * Requires a FinMind API token in FINMIND_TOKEN; a missing token aborts with a
 * clear message and a non-zero exit (the client throws before any network call).
 *
 * Idempotent / resumable: each dataset is mapped to the FULL domain series and
 * written via SnapshotSeriesCache.seedSeries, which de-dups by key and caps from
 * the front. Re-running merges rather than duplicates; the mapper derives
 * mom/yoy/accYoy over the whole assembled series each call, so a resumed partial
 * seed converges to the same result as a single clean run.
 *
 * Layering: this is a `server/scripts/` build-time tool. FinMind (client/mapper)
 * is NEVER imported by `server/src/` runtime — CLAUDE.md invariant
 * "不新增第三方資料供應商". The persistence cache it writes through is generic and
 * carries no FinMind reference.
 */
import { config } from "../src/config.js";
import type { MonthlyRevenue } from "../src/domain/revenue.js";
import type { ValuationPoint } from "../src/domain/valuation.js";
import { SnapshotSeriesCache } from "../src/persistence/snapshotSeriesCache.js";
import { VALUATION_SERIES_CAP } from "../src/usecase/stockPageDeps.js";
import {
  createFinmindClient,
  type FinmindClient,
} from "./finmindClient.js";
import { mapMonthRevenueRows, mapPerRows } from "./finmindMapper.js";

/**
 * Per-symbol revenue history retained, matching the runtime const of the same
 * name in server/src/index.ts (REVENUE_SERIES_CAP = 360 — not exported there, so
 * it is mirrored here with this note; both must stay in lock-step).
 */
const REVENUE_SERIES_CAP = 360;

export interface RunBackfillOptions {
  /** Injected FinMind client (tests pass a fake; CLI builds the real one). */
  client: FinmindClient;
  /** Stock symbols to backfill. */
  symbols: readonly string[];
  /** Data dir root for the per-symbol caches. */
  dataDir: string;
}

/**
 * Backfill PE/PB + monthly-revenue history for each symbol into the per-symbol
 * caches. A per-symbol/per-dataset failure is logged and skipped so one bad
 * fetch never aborts the whole batch. Importable so tests inject a fake client.
 */
export async function runBackfill(options: RunBackfillOptions): Promise<void> {
  const { client, symbols, dataDir } = options;

  // upsertLatest is never used by the seed path, so the injected fetcher is a
  // no-op (returns null → existing series untouched).
  const valuationSeries = new SnapshotSeriesCache<ValuationPoint>(
    dataDir,
    "valuation-series",
    (item) => item.date,
    VALUATION_SERIES_CAP,
    async () => null,
  );
  const revenue = new SnapshotSeriesCache<MonthlyRevenue>(
    dataDir,
    "revenue",
    (item) => item.yearMonth,
    REVENUE_SERIES_CAP,
    async () => null,
  );

  for (const symbol of symbols) {
    try {
      const perRows = await client.fetchPER(symbol);
      const points = mapPerRows(perRows as never[]);
      await valuationSeries.seedSeries(symbol, points);
      console.log(`[backfill] ${symbol} valuation: ${points.length} points`);
    } catch (err) {
      console.error(`[backfill] ${symbol} valuation failed — skipped:`, err);
    }

    try {
      const revRows = await client.fetchMonthRevenue(symbol);
      const points = mapMonthRevenueRows(revRows as never[]);
      await revenue.seedSeries(symbol, points);
      console.log(`[backfill] ${symbol} revenue: ${points.length} months`);
    } catch (err) {
      console.error(`[backfill] ${symbol} revenue failed — skipped:`, err);
    }
  }
}

/** CLI entry: parse argv symbols, build the real client, run the backfill. */
async function main(): Promise<void> {
  const symbols = process.argv.slice(2).filter((s) => s.trim() !== "");
  if (symbols.length === 0) {
    console.error(
      "usage: npx tsx server/scripts/backfill-history.ts <symbols...>",
    );
    process.exit(1);
    return;
  }

  // Fail fast on a missing token BEFORE any work — clear message + non-zero exit.
  // (The client also throws on its first fetch, but checking here avoids a
  // partial sweep and gives a single actionable message.)
  if ((process.env.FINMIND_TOKEN ?? "").trim() === "") {
    console.error(
      "[backfill] FINMIND_TOKEN not set — provide it via the FINMIND_TOKEN environment variable",
    );
    console.error(
      "e.g. FINMIND_TOKEN=... npx tsx server/scripts/backfill-history.ts 2330",
    );
    process.exit(1);
    return;
  }

  const client: FinmindClient = createFinmindClient();

  await runBackfill({ client, symbols, dataDir: config.dataDir });
  console.log("[backfill] done.");
}

// Run only when invoked directly (not when imported by tests).
if (
  process.argv[1] != null &&
  import.meta.url === `file://${process.argv[1]}`
) {
  void main();
}
