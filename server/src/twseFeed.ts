import { EventEmitter } from "node:events";
import { config } from "./config.js";
import { isValidSymbol } from "./validation.js";
import type { UniverseProvider } from "./universe/UniverseProvider.js";
import type { WatchlistStore } from "./watchlist/store.js";
import type { CandleStore } from "./candleStore.js";
import type {
  Quote,
  MarketStatus,
  Session,
  Direction,
  PriceLevel,
  InstrumentMeta,
  KlineInterval,
  Candle,
} from "./types.js";

/**
 * TWSE MIS market-data feed. Pure helpers normalize the getStockInfo payload
 * into the canonical wire types; TwseFeed polls and re-emits "quote"/"market".
 */

const MS_PER_MINUTE = 60_000;

/** "tse_2330.tw|tse_2317.tw" — the batched ex_ch query value. */
export function buildExCh(instruments: InstrumentMeta[]): string {
  return instruments.map((i) => `${i.exch}_${i.symbol}.tw`).join("|");
}

/** Split `items` into chunks of at most `size` (size coerced to >= 1). */
export function chunk<T>(items: T[], size: number): T[][] {
  const n = Number.isFinite(size) && size >= 1 ? Math.trunc(size) : 1;
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) {
    out.push(items.slice(i, i + n));
  }
  return out;
}

/** Parse a MIS numeric field, treating "-"/empty/missing/NaN as null. */
export function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed === "" || trimmed === "-") return null;
  const n = Number.parseFloat(trimmed);
  return Number.isNaN(n) ? null : n;
}

/** Read a MIS field as a string ("" when missing/non-string). */
function strOf(item: Record<string, unknown>, key: string): string {
  const v = item[key];
  return typeof v === "string" ? v : "";
}

/** Parse an integer MIS field, defaulting to 0 when missing/invalid. */
function intOrZero(v: unknown): number {
  const n = numOrNull(v);
  return n == null ? 0 : Math.trunc(n);
}

/**
 * Zip "_"-separated price/size strings into levels: drop empty tokens (incl. the
 * trailing one MIS appends), then cap to the shorter list.
 */
export function parseLevels(
  priceStr: string | undefined,
  sizeStr: string | undefined,
): PriceLevel[] {
  const prices = (priceStr ?? "")
    .split("_")
    .filter((s) => s !== "")
    .map((s) => Number.parseFloat(s));
  const sizes = (sizeStr ?? "")
    .split("_")
    .filter((s) => s !== "")
    .map((s) => Number.parseInt(s, 10));
  const len = Math.min(prices.length, sizes.length);
  const levels: PriceLevel[] = [];
  for (let i = 0; i < len; i++) {
    const price = prices[i];
    const size = sizes[i];
    // Drop non-finite tokens: Number.parseFloat("-")/"abc" yields NaN, which the
    // null-only guard would miss and poison bestBid/bestAsk and the price chain.
    if (
      price == null ||
      size == null ||
      !Number.isFinite(price) ||
      !Number.isFinite(size)
    )
      continue;
    levels.push({ price, size });
  }
  return levels;
}

/** First finite value in a list, else null (NaN is treated like null). */
function firstNonNull(...values: (number | null)[]): number | null {
  for (const v of values) {
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

/** Direction of `price` relative to a reference (null price → "flat"). */
function directionVs(price: number | null, ref: number | null): Direction {
  if (price == null || ref == null) return "flat";
  if (price > ref) return "up";
  if (price < ref) return "down";
  return "flat";
}

/**
 * Build a normalized Quote from a raw MIS item. Price resolution chain (z is
 * often "-" mid-session): z → pz → prevPrice (carried) → midpoint → o → y.
 */
export function parseMisItem(
  item: Record<string, unknown>,
  meta: InstrumentMeta | undefined,
  prevPrice: number | null,
  now: number,
): Quote {
  const symbol = strOf(item, "c");
  const asks = parseLevels(strOf(item, "a"), strOf(item, "f"));
  const bids = parseLevels(strOf(item, "b"), strOf(item, "g"));

  const bestBid = bids.length > 0 ? bids[0]!.price : null;
  const bestAsk = asks.length > 0 ? asks[0]!.price : null;
  const midpoint =
    bestBid != null &&
    bestAsk != null &&
    Number.isFinite(bestBid) &&
    Number.isFinite(bestAsk)
      ? (bestBid + bestAsk) / 2
      : null;

  const open = numOrNull(item["o"]);
  const prevCloseRaw = numOrNull(item["y"]);
  const prevClose = prevCloseRaw ?? 0;

  const price = firstNonNull(
    numOrNull(item["z"]),
    numOrNull(item["pz"]),
    prevPrice,
    midpoint,
    open,
    prevCloseRaw,
  );

  const change = price == null ? 0 : price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;

  return {
    symbol,
    exch: strOf(item, "ex") || meta?.exch || "tse",
    name: strOf(item, "n") || meta?.name || symbol,
    fullName: strOf(item, "nf"),
    price,
    prevClose,
    open,
    high: numOrNull(item["h"]),
    low: numOrNull(item["l"]),
    limitUp: numOrNull(item["u"]),
    limitDown: numOrNull(item["w"]),
    volume: intOrZero(item["v"]),
    lastVolume: intOrZero(item["tv"]),
    change,
    changePercent,
    direction: directionVs(price, prevClose),
    tick: directionVs(price, prevPrice),
    bids,
    asks,
    time: strOf(item, "t"),
    tlong: intOrZero(item["tlong"]),
    updatedAt: now,
  };
}

/** Normalize a getStockInfo response into Quote[]; tolerates missing msgArray, skips symbol-less items. */
export function parseMisResponse(
  json: unknown,
  metaBySymbol: Map<string, InstrumentMeta>,
  prevPrices: Map<string, number | null>,
  now: number,
): Quote[] {
  const root = (json ?? {}) as Record<string, unknown>;
  const rawArray = root["msgArray"];
  const items = Array.isArray(rawArray) ? rawArray : [];
  const quotes: Quote[] = [];
  for (const raw of items) {
    if (raw == null || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const symbol = strOf(item, "c");
    if (symbol === "") continue;
    const prevPrice = prevPrices.get(symbol) ?? null;
    quotes.push(parseMisItem(item, metaBySymbol.get(symbol), prevPrice, now));
  }
  return quotes;
}

/** Classify the trading session for `now` against the TPE wall clock. */
export function computeMarketStatus(now: number): MarketStatus {
  const shifted = new Date(now + config.session.tzOffsetMinutes * MS_PER_MINUTE);
  const weekday = shifted.getUTCDay(); // 0 = Sun ... 6 = Sat
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();

  const isWeekend = weekday === 0 || weekday === 6;
  const { preOpenMinute, openMinute, closeMinute } = config.session;

  let session: Session;
  if (isWeekend || minutes < preOpenMinute || minutes >= closeMinute) {
    session = "closed";
  } else if (minutes < openMinute) {
    session = "pre";
  } else {
    session = "open";
  }

  const labelBySession: Record<Session, string> = {
    pre: "盤前",
    open: "開盤中",
    closed: "休市",
  };

  return {
    isOpen: session === "open",
    session,
    serverTime: now,
    label: labelBySession[session],
  };
}

/** Payload of a "candle" feed event — a forming or just-closed intraday bar. */
export interface CandleEvent {
  symbol: string;
  interval: KlineInterval;
  candle: Candle;
  closed: boolean;
}

export interface TwseFeedEvents {
  quote: (q: Quote) => void;
  market: (m: MarketStatus) => void;
  candle: (c: CandleEvent) => void;
}

export interface TwseFeedDeps {
  watchlist: WatchlistStore;
  provider: UniverseProvider;
  /** Shared set of on-demand-viewed symbols (mutated via addView). */
  viewed: Set<string>;
  /** Folds per-tick quotes into multi-interval intraday candles. */
  candleStore: CandleStore;
}

/** Live feed: batched poll per interval, rolling history, re-emits events. */
export class TwseFeed extends EventEmitter {
  /** Upper bound on the on-demand viewed set (oldest evicted past this). */
  private static readonly MAX_VIEWED = 200;

  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly snapshot = new Map<string, Quote>();
  private readonly history = new Map<string, number[]>();
  private readonly prevPrices = new Map<string, number | null>();
  private readonly watchlist: WatchlistStore;
  private readonly provider: UniverseProvider;
  private readonly viewed: Set<string>;
  private readonly candleStore: CandleStore;
  private marketLabel: string;

  constructor(deps: TwseFeedDeps) {
    super();
    this.watchlist = deps.watchlist;
    this.provider = deps.provider;
    this.viewed = deps.viewed;
    this.candleStore = deps.candleStore;
    this.marketLabel = computeMarketStatus(Date.now()).label;
  }

  /**
   * Register an on-demand viewed symbol so the next poll includes it. The set
   * is bounded (oldest evicted past MAX_VIEWED) so a flood of distinct `view`
   * messages can't grow the active poll set without limit, and the symbol must
   * be well-formed so junk never reaches the upstream poll.
   */
  addView(symbol: string): void {
    const sym = symbol.trim();
    if (!isValidSymbol(sym) || this.viewed.has(sym)) return;
    if (this.viewed.size >= TwseFeed.MAX_VIEWED) {
      // Set preserves insertion order — drop the oldest viewed symbol.
      const oldest = this.viewed.values().next().value;
      if (oldest !== undefined) this.viewed.delete(oldest);
    }
    this.viewed.add(sym);
  }

  /**
   * The DYNAMIC active poll set: watchlist symbols in order, then any viewed
   * symbols not already in the watchlist. Stable + deduped — every iteration
   * over snapshot/history uses this same order.
   */
  getActiveSymbols(): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const sym of this.watchlist.get()) {
      if (!seen.has(sym)) {
        seen.add(sym);
        out.push(sym);
      }
    }
    for (const sym of this.viewed) {
      if (!seen.has(sym)) {
        seen.add(sym);
        out.push(sym);
      }
    }
    return out;
  }

  /**
   * Resolve per-symbol meta via the universe provider, falling back to a
   * minimal record so unknown symbols still stream with a sane shape.
   */
  private metaFor(symbol: string): InstrumentMeta {
    const sec = this.provider.get(symbol);
    if (sec != null) {
      return {
        symbol: sec.symbol,
        name: sec.name,
        exch: sec.exch,
        type: sec.type,
      };
    }
    return { symbol, name: symbol, exch: "tse" };
  }

  /** Active instruments (with resolved meta) in stable active-set order. */
  private activeInstruments(): InstrumentMeta[] {
    return this.getActiveSymbols().map((sym) => this.metaFor(sym));
  }

  start(): void {
    if (this.timer != null) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), config.pollIntervalMs);
  }

  stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getSnapshot(): Quote[] {
    const quotes: Quote[] = [];
    for (const symbol of this.getActiveSymbols()) {
      const q = this.snapshot.get(symbol);
      if (q != null) quotes.push(q);
    }
    return quotes;
  }

  getHistory(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const symbol of this.getActiveSymbols()) {
      out[symbol] = this.history.get(symbol) ?? [];
    }
    return out;
  }

  getMarket(): MarketStatus {
    return computeMarketStatus(Date.now());
  }

  /** Single poll cycle. Never throws — failures are logged and swallowed. */
  private async poll(): Promise<void> {
    const now = Date.now();
    const instruments = this.activeInstruments();
    const metaBySymbol = new Map(instruments.map((i) => [i.symbol, i]));
    try {
      // Chunk the active set so a large watchlist∪viewed stays within the MIS
      // ex_ch limit; each batch is fetched independently and merged.
      const merged: Quote[] = [];
      for (const batch of chunk(instruments, config.maxBatch)) {
        if (batch.length === 0) continue;
        const params = new URLSearchParams({
          ex_ch: buildExCh(batch),
          json: "1",
          delay: "0",
          _: String(now),
        });
        const url = `${config.twseBaseUrl}?${params.toString()}`;
        // Bound each poll so a hung upstream connection cannot stall the feed;
        // the AbortError is caught below and the next interval retries.
        const res = await fetch(url, {
          signal: AbortSignal.timeout(Math.min(config.pollIntervalMs, 5000)),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            Referer: "https://mis.twse.com.tw/stock/index.jsp",
          },
        });
        if (!res.ok) {
          console.error(`[twseFeed] poll failed: HTTP ${res.status}`);
          continue;
        }
        const json: unknown = await res.json();
        const quotes = parseMisResponse(
          json,
          metaBySymbol,
          this.prevPrices,
          now,
        );
        for (const q of quotes) merged.push(q);
      }
      this.ingest(merged, instruments);
    } catch (err) {
      console.error("[twseFeed] poll error:", err);
    }
    this.refreshMarket(now);
  }

  /** Apply a batch of parsed quotes to snapshot/history and emit per instrument. */
  private ingest(quotes: Quote[], instruments: InstrumentMeta[]): void {
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));
    for (const meta of instruments) {
      const quote = bySymbol.get(meta.symbol);
      if (quote == null) continue;
      this.snapshot.set(meta.symbol, quote);
      if (quote.price != null && Number.isFinite(quote.price)) {
        const prev = this.history.get(meta.symbol) ?? [];
        const next = [...prev, quote.price].slice(-config.historyLength);
        this.history.set(meta.symbol, next);
        this.prevPrices.set(meta.symbol, quote.price);

        // Fold this tick into the intraday candle buckets and re-emit every
        // forming/closed bar update so the WS layer can broadcast it.
        const epochMs = quote.tlong > 0 ? quote.tlong : Date.now();
        const updates = this.candleStore.ingestTick(
          quote.symbol,
          quote.price,
          quote.volume,
          epochMs,
        );
        for (const update of updates) {
          this.emit("candle", {
            symbol: quote.symbol,
            interval: update.interval,
            candle: update.candle,
            closed: update.closed,
          });
        }
      }
      this.emit("quote", quote);
    }
  }

  /** Recompute the session; emit "market" only when the label actually changes. */
  private refreshMarket(now: number): void {
    const next = computeMarketStatus(now);
    if (next.label !== this.marketLabel) {
      this.marketLabel = next.label;
      this.emit("market", next);
    }
  }
}
