/**
 * adapters/misClient — the outbound IO boundary for the TWSE MIS real-time
 * quote API (`getStockInfo.jsp`). This module ONLY does the network call: build
 * the `ex_ch` batch URL, attach the browser-like UA/Referer headers, bound the
 * request with a timeout, and return the raw JSON body. All parsing of that body
 * into `Quote`s stays in `domain/` (`parseMisResponse`).
 *
 * The fetch is injectable (`fetchImpl`) so the feed can be tested with a stub.
 * Non-2xx is handled here at the boundary (logged, resolves to `null` so the
 * caller skips that batch — exactly the old `continue`). Transport/timeout
 * errors propagate so the feed's poll-level try/catch records `lastError` and
 * bumps the consecutive-failure count, preserving the original health semantics.
 */
import { config } from "../config.js";
import { buildExCh } from "../domain/index.js";
import type { InstrumentMeta } from "../domain/index.js";

/** Hard ceiling on a single MIS request so a hung upstream cannot stall the feed. */
const MAX_TIMEOUT_MS = 5000;

export interface MisClientConfig {
  /** MIS getStockInfo endpoint. */
  twseBaseUrl: string;
  /** Upstream poll interval — also bounds the per-request timeout. */
  pollIntervalMs: number;
}

export interface MisClient {
  /**
   * Fetch ONE batch of instruments from MIS and return the raw JSON body, or
   * `null` on non-2xx (the caller skips that batch). Throws on transport/timeout
   * so the caller's poll-level catch can record the error.
   */
  fetchBatch(batch: InstrumentMeta[], now: number): Promise<unknown | null>;
}

/**
 * Real MIS client backed by `fetch`. `fetchImpl` defaults to global `fetch` and
 * `cfg` to the app config, so production callers can `new MisClient()` while
 * tests inject a stub fetch.
 */
export function createMisClient(
  fetchImpl: typeof fetch = fetch,
  cfg: MisClientConfig = config,
): MisClient {
  const timeoutMs = Math.min(cfg.pollIntervalMs, MAX_TIMEOUT_MS);

  return {
    async fetchBatch(
      batch: InstrumentMeta[],
      now: number,
    ): Promise<unknown | null> {
      if (batch.length === 0) return null;
      const params = new URLSearchParams({
        ex_ch: buildExCh(batch),
        json: "1",
        delay: "0",
        _: String(now),
      });
      const url = `${cfg.twseBaseUrl}?${params.toString()}`;
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Referer: "https://mis.twse.com.tw/stock/index.jsp",
        },
      });
      if (!res.ok) {
        console.error(`[twseFeed] poll failed: HTTP ${res.status}`);
        return null;
      }
      return (await res.json()) as unknown;
    },
  };
}
