import { config } from "../config.js";
import type { Security, SecurityType } from "../types.js";

/**
 * Universe sources: fetch the two key-free OpenAPI directory endpoints
 * (TWSE STOCK_DAY_ALL + TPEx mainboard daily close) and merge into Security[].
 *
 * The row→Security mapping is extracted as pure exported helpers so it is
 * testable without any network access.
 */

/** Browser-like UA — the OpenAPI hosts 403 default fetch agents. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Per-source fetch timeout. The TPEx body is ~3MB so allow a generous window. */
const FETCH_TIMEOUT_MS = 15_000;

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

/** Fetch one directory endpoint as a JSON array; throws on non-OK/timeout. */
async function fetchJsonArray(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as unknown;
}

export interface UniverseSourceConfig {
  universeTwseUrl: string;
  universeTpexUrl: string;
}

/**
 * Fetch BOTH endpoints with per-source try/catch so one failing source still
 * yields the other. Returns the merged, deduped Security[] (TSE wins on clash).
 * Throws only when BOTH sources fail (caller falls back to stale cache).
 */
export async function fetchUniverse(
  cfg: UniverseSourceConfig = config,
): Promise<Security[]> {
  let twseRows: unknown = [];
  let tpexRows: unknown = [];
  let twseOk = false;
  let tpexOk = false;

  try {
    twseRows = await fetchJsonArray(cfg.universeTwseUrl);
    twseOk = true;
  } catch (err) {
    console.error("[universe] TWSE source failed:", err);
  }

  try {
    tpexRows = await fetchJsonArray(cfg.universeTpexUrl);
    tpexOk = true;
  } catch (err) {
    console.error("[universe] TPEx source failed:", err);
  }

  if (!twseOk && !tpexOk) {
    throw new Error("[universe] both sources failed");
  }

  return normalizeUniverse(twseRows, tpexRows);
}
