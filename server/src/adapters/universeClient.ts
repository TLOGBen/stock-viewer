/**
 * adapters/universeClient — outbound IO boundary for the two key-free OpenAPI
 * directory endpoints (TWSE `STOCK_DAY_ALL` + TPEx mainboard daily close). It
 * fetches the raw JSON arrays and exposes `fetchUniverse` which folds the pure
 * row→Security mapping + dedupe (`normalizeUniverse`, in `domain/`) over them.
 *
 * Each source is fetched independently with per-source try/catch so one failing
 * source still yields the other. Throws only when BOTH sources fail (caller
 * falls back to the stale cache). The fetch is injectable for tests.
 */

import { config } from "../config.js";
import type { Security } from "../domain/index.js";
import { normalizeUniverse } from "../domain/index.js";

/** Browser-like UA — the OpenAPI hosts 403 default fetch agents. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Per-source fetch timeout. The TPEx body is ~3MB so allow a generous window. */
const FETCH_TIMEOUT_MS = 15_000;

export interface UniverseEndpoints {
  universeTwseUrl: string;
  universeTpexUrl: string;
}

/** Raw, unparsed directory payloads (each is `unknown` until domain normalises). */
export interface RawUniverse {
  twseRows: unknown;
  tpexRows: unknown;
}

export interface UniverseClient {
  /**
   * Fetch BOTH directory endpoints, returning their raw bodies. One failing
   * source degrades to `[]` for that source; throws only when BOTH fail.
   */
  fetchRaw(endpoints: UniverseEndpoints): Promise<RawUniverse>;
}

/** Fetch one directory endpoint as a JSON array; throws on non-OK/timeout. */
async function fetchJsonArray(
  fetchImpl: typeof fetch,
  url: string,
): Promise<unknown> {
  const res = await fetchImpl(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as unknown;
}

/** Real universe client backed by `fetch` (injectable for tests). */
export function createUniverseClient(
  fetchImpl: typeof fetch = fetch,
): UniverseClient {
  return {
    async fetchRaw(endpoints: UniverseEndpoints): Promise<RawUniverse> {
      let twseRows: unknown = [];
      let tpexRows: unknown = [];
      let twseOk = false;
      let tpexOk = false;

      try {
        twseRows = await fetchJsonArray(fetchImpl, endpoints.universeTwseUrl);
        twseOk = true;
      } catch (err) {
        console.error("[universe] TWSE source failed:", err);
      }

      try {
        tpexRows = await fetchJsonArray(fetchImpl, endpoints.universeTpexUrl);
        tpexOk = true;
      } catch (err) {
        console.error("[universe] TPEx source failed:", err);
      }

      if (!twseOk && !tpexOk) {
        throw new Error("[universe] both sources failed");
      }

      return { twseRows, tpexRows };
    },
  };
}

/**
 * Fetch BOTH endpoints (via the injectable client) then run the pure
 * normalize+dedupe (`domain/normalizeUniverse`). Returns the merged, deduped
 * Security[] (TSE wins on clash). The client throws only when BOTH sources fail
 * (caller falls back to stale cache); `client` is injectable so callers/tests
 * can stub the network.
 */
export async function fetchUniverse(
  cfg: UniverseEndpoints = config,
  client: UniverseClient = createUniverseClient(),
): Promise<Security[]> {
  const { twseRows, tpexRows } = await client.fetchRaw(cfg);
  return normalizeUniverse(twseRows, tpexRows);
}
