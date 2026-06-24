import { config } from "../config.js";
import type { Security, SecurityType } from "../types.js";
import {
  createUniverseClient,
  type UniverseClient,
} from "../adapters/universeClient.js";

/**
 * Universe sources: merge the two key-free OpenAPI directory endpoints
 * (TWSE STOCK_DAY_ALL + TPEx mainboard daily close) into Security[].
 *
 * The network fetch now lives in `adapters/universeClient`; this module keeps
 * the pure, network-free row→Security mapping + dedupe (exported for tests) and
 * orchestrates "fetch raw → normalize".
 */

/** Classify a security by code shape: 00-prefixed → ETF, else stock. */
export function classifyType(code: string): SecurityType {
  return code.startsWith("00") ? "etf" : "stock";
}

/** A loosely-typed JSON row from either directory endpoint. */
export type UniverseRow = Record<string, unknown>;

/** Read a string field, trimming; "" when missing/non-string. */
function field(row: UniverseRow, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Map ONE TWSE STOCK_DAY_ALL row → Security, or null when the row lacks a
 * code/name. Pure: { Code, Name, ... } → Security with exch="tse".
 */
export function mapTwseRow(row: UniverseRow): Security | null {
  const symbol = field(row, "Code");
  const name = field(row, "Name");
  if (symbol === "" || name === "") return null;
  return { symbol, name, exch: "tse", type: classifyType(symbol) };
}

/**
 * Map ONE TPEx mainboard row → Security, or null when the row lacks a
 * code/name. Pure: { SecuritiesCompanyCode, CompanyName, ... } → Security
 * with exch="otc".
 */
export function mapTpexRow(row: UniverseRow): Security | null {
  const symbol = field(row, "SecuritiesCompanyCode");
  const name = field(row, "CompanyName");
  if (symbol === "" || name === "") return null;
  return { symbol, name, exch: "otc", type: classifyType(symbol) };
}

/**
 * Pure normalize+dedupe: map both raw arrays via their row mappers and merge
 * into a single Security[]. TSE wins on symbol clash (inserted first; TPEx
 * only fills symbols not already present). Testable without network.
 */
export function normalizeUniverse(
  twseRows: unknown,
  tpexRows: unknown,
): Security[] {
  const bySymbol = new Map<string, Security>();

  const twse = Array.isArray(twseRows) ? twseRows : [];
  for (const raw of twse) {
    if (raw == null || typeof raw !== "object") continue;
    const sec = mapTwseRow(raw as UniverseRow);
    if (sec != null && !bySymbol.has(sec.symbol)) bySymbol.set(sec.symbol, sec);
  }

  const tpex = Array.isArray(tpexRows) ? tpexRows : [];
  for (const raw of tpex) {
    if (raw == null || typeof raw !== "object") continue;
    const sec = mapTpexRow(raw as UniverseRow);
    if (sec != null && !bySymbol.has(sec.symbol)) bySymbol.set(sec.symbol, sec);
  }

  return [...bySymbol.values()];
}

export interface UniverseSourceConfig {
  universeTwseUrl: string;
  universeTpexUrl: string;
}

/**
 * Fetch BOTH endpoints (via the injectable adapters/universeClient) then run
 * the pure normalize+dedupe. Returns the merged, deduped Security[] (TSE wins on
 * clash). The client throws only when BOTH sources fail (caller falls back to
 * stale cache); `client` is injectable so callers/tests can stub the network.
 */
export async function fetchUniverse(
  cfg: UniverseSourceConfig = config,
  client: UniverseClient = createUniverseClient(),
): Promise<Security[]> {
  const { twseRows, tpexRows } = await client.fetchRaw(cfg);
  return normalizeUniverse(twseRows, tpexRows);
}
