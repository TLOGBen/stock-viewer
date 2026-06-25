/**
 * scripts/finmindClient — BUILD-TIME ONLY FinMind data client.
 *
 * This module is a *seed* dependency used by `backfill-history.ts` to backfill
 * per-symbol PE/PB (estimation river) and monthly-revenue history. It lives in
 * `server/scripts/` and MUST NEVER be imported by anything under `server/src/`
 * (runtime). FinMind is not a runtime data supplier — see CLAUDE.md invariant
 * "不新增第三方資料供應商". Mapping of the raw rows to domain types is the job of
 * scripts-02's mapper, not this client.
 *
 * The client is honest about failure: each method THROWS on a per-call failure
 * (non-2xx HTTP, body status !== 200, or a rejected fetch). The CLI/batch layer
 * is expected to catch-and-skip a single failed period/symbol so one bad call
 * never aborts the whole sweep.
 */

/** FinMind v4 data endpoint. */
const FINMIND_DATA_URL = "https://api.finmindtrade.com/api/v4/data";

/**
 * Minimum spacing (ms) between two real fetches, mirroring the persistence
 * BACKFILL_THROTTLE_MS = 350 idiom. Hardcoded here (with this comment) rather
 * than imported, because scripts/ must not depend on runtime persistence code.
 */
const DEFAULT_THROTTLE_MS = 350;

/** FinMind datasets this client knows how to fetch. */
type Dataset = "TaiwanStockPER" | "TaiwanStockMonthRevenue";

/** Shape of the FinMind v4 JSON envelope. We only rely on `status` + `data`. */
interface FinmindEnvelope {
  msg?: string;
  status?: number;
  data?: unknown[];
}

export interface FinmindClientOptions {
  /** Injected fetch (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** API token; defaults to process.env.FINMIND_TOKEN. */
  token?: string;
  /** Minimum spacing between successive fetches (ms). Default 350; 0 disables. */
  throttleMs?: number;
  /** Injected delay fn (ms); default a real setTimeout sleep. For test speed. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected clock; default Date.now. For deterministic throttle tests. */
  now?: () => number;
}

export interface FinmindClient {
  /** Fetch full TaiwanStockPER history for a symbol; returns the raw data array. */
  fetchPER(symbol: string, startDate?: string): Promise<unknown[]>;
  /** Fetch full TaiwanStockMonthRevenue history; returns the raw data array. */
  fetchMonthRevenue(symbol: string, startDate?: string): Promise<unknown[]>;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Build the FinMind v4 data URL for one dataset/symbol query. */
function buildUrl(
  dataset: Dataset,
  symbol: string,
  token: string,
  startDate?: string,
): string {
  const params = new URLSearchParams({
    dataset,
    data_id: symbol,
    token,
  });
  if (startDate) params.set("start_date", startDate);
  return `${FINMIND_DATA_URL}?${params.toString()}`;
}

/**
 * Create a script-local FinMind client. `token` is resolved eagerly from the
 * option or FINMIND_TOKEN; a missing/empty token makes every fetch method throw
 * a clear error BEFORE any network call (the CLI maps this to a non-zero exit).
 */
export function createFinmindClient(
  options: FinmindClientOptions = {},
): FinmindClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;

  // resolve token lazily per call so an env var set after construction still
  // works, but always BEFORE issuing any fetch.
  const resolveToken = (): string => {
    const token = options.token ?? process.env.FINMIND_TOKEN ?? "";
    if (!token) {
      throw new Error(
        "FINMIND_TOKEN not set — provide it via the FINMIND_TOKEN environment variable",
      );
    }
    return token;
  };

  let lastFetchAt = 0;

  /** Enforce the inter-fetch spacing using the injected sleep + clock. */
  async function throttle(): Promise<void> {
    if (throttleMs <= 0) return;
    const elapsed = now() - lastFetchAt;
    const wait = throttleMs - elapsed;
    if (lastFetchAt !== 0 && wait > 0) {
      await sleep(wait);
    }
  }

  async function fetchDataset(
    dataset: Dataset,
    symbol: string,
    startDate?: string,
  ): Promise<unknown[]> {
    // token check happens first — never touch the network without it.
    const token = resolveToken();
    await throttle();

    const url = buildUrl(dataset, symbol, token, startDate);
    let res: Response;
    try {
      res = await fetchImpl(url);
    } finally {
      lastFetchAt = now();
    }

    if (!res.ok) {
      throw new Error(
        `FinMind ${dataset} fetch for ${symbol} failed: HTTP ${res.status}`,
      );
    }

    const body = (await res.json()) as FinmindEnvelope;
    if (body.status !== 200) {
      throw new Error(
        `FinMind ${dataset} fetch for ${symbol} returned status ${body.status} (${body.msg ?? "no msg"})`,
      );
    }

    return Array.isArray(body.data) ? body.data : [];
  }

  return {
    fetchPER: (symbol, startDate) =>
      fetchDataset("TaiwanStockPER", symbol, startDate),
    fetchMonthRevenue: (symbol, startDate) =>
      fetchDataset("TaiwanStockMonthRevenue", symbol, startDate),
  };
}
