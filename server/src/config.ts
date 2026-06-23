import { fileURLToPath } from "node:url";
import type { InstrumentMeta } from "./types.js";

/**
 * Runtime configuration for the TWSE backend.
 * Everything is overridable via environment variables so no values are hardcoded at the call site.
 * The TWSE MIS API requires NO API key.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Absolute path to the on-disk data dir (universe.json / watchlist.json).
 * Resolves to <server>/data relative to this source file, surviving any cwd.
 * Env override DATA_DIR wins for deployment flexibility.
 */
function resolveDataDir(): string {
  const fromEnv = process.env.DATA_DIR;
  if (fromEnv && fromEnv.trim() !== "") return fromEnv;
  // import.meta.url is .../server/src/config.ts (or dist/config.js) → ../data
  return fileURLToPath(new URL("../data/", import.meta.url));
}

/** The 8 configured instruments. ex_ch codes use the tse_/otc_ prefix expected by the MIS API. */
export const INSTRUMENTS: InstrumentMeta[] = [
  { symbol: "2330", name: "台積電", exch: "tse" },
  { symbol: "2317", name: "鴻海", exch: "tse" },
  { symbol: "2454", name: "聯發科", exch: "tse" },
  { symbol: "2308", name: "台達電", exch: "tse" },
  { symbol: "2382", name: "廣達", exch: "tse" },
  { symbol: "2881", name: "富邦金", exch: "tse" },
  { symbol: "2412", name: "中華電", exch: "tse" },
  { symbol: "0050", name: "元大台灣50", exch: "tse" },
];

/** Allow overriding the instrument list via TWSE_SYMBOLS="2330,2317,..." (exch defaults to tse). */
function resolveInstruments(): InstrumentMeta[] {
  const raw = process.env.TWSE_SYMBOLS;
  if (!raw) return INSTRUMENTS;
  const overrides = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token): InstrumentMeta => {
      const parts = token.split(":");
      const sym = parts[0] ?? token;
      const exch = parts[1] ?? "tse";
      const known = INSTRUMENTS.find((i) => i.symbol === sym);
      return { symbol: sym, name: known?.name ?? sym, exch };
    });
  return overrides.length ? overrides : INSTRUMENTS;
}

export const config = {
  port: envInt("PORT", 4000),
  /**
   * Bind address. Defaults to loopback so a single-user local desk is NOT
   * exposed to the LAN; set HOST=0.0.0.0 to listen on all interfaces when
   * deploying or serving the Nuxt app from another machine/container.
   */
  host: process.env.HOST ?? "127.0.0.1",
  /** TWSE MIS real-time quote endpoint (batched ex_ch query). */
  twseBaseUrl:
    process.env.TWSE_BASE_URL ??
    "https://mis.twse.com.tw/stock/api/getStockInfo.jsp",
  /** Upstream poll interval (ms). TWSE recommends ~5s; do not hammer it. */
  pollIntervalMs: envInt("POLL_INTERVAL_MS", 3500),
  /** Number of rolling history points retained per instrument for the live sparkline. */
  historyLength: envInt("HISTORY_LENGTH", 120),
  /** CORS allowlist for the Nuxt dev origin(s). "*" allowed for local dev. */
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  instruments: resolveInstruments(),
  /** Absolute dir for persisted universe.json / watchlist.json. */
  dataDir: resolveDataDir(),
  /** TWSE listed + ETF daily-close directory (key-free OpenAPI). */
  universeTwseUrl:
    process.env.UNIVERSE_TWSE_URL ??
    "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
  /** TPEx OTC mainboard daily-close directory (key-free OpenAPI). */
  universeTpexUrl:
    process.env.UNIVERSE_TPEX_URL ??
    "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
  /** Universe cache TTL — re-fetch when older than this (default 24h). */
  universeTtlMs: envInt("UNIVERSE_TTL_MS", 24 * 60 * 60 * 1000),
  /** Background universe refresh cadence (default 12h). */
  universeRefreshMs: envInt("UNIVERSE_REFRESH_MS", 12 * 60 * 60 * 1000),
  /** Max symbols per MIS ex_ch batch — large active sets are chunked. */
  maxBatch: envInt("MAX_BATCH", 100),
  /** Taiwan equity regular session, in minutes since midnight TPE. */
  session: {
    openMinute: 9 * 60, // 09:00
    closeMinute: 13 * 60 + 30, // 13:30
    preOpenMinute: 8 * 60 + 30, // 08:30 pre-market
    tzOffsetMinutes: 8 * 60, // TPE is UTC+8, no DST
  },
} as const;

export type AppConfig = typeof config;
