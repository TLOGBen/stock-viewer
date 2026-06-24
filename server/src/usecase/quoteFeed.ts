import { EventEmitter } from "node:events";
import { config } from "../config.js";
import { isValidSymbol } from "../domain/index.js";
import type { UniverseProvider } from "./universeService.js";
import type { WatchlistStore } from "../persistence/index.js";
import type { CandleStore } from "../persistence/index.js";
import { OfficialCloseCache } from "../persistence/index.js";
import { createMisClient, type MisClient } from "../adapters/index.js";
import {
  chunk,
  parseMisResponse,
  parseStockDayAllRow,
  computeMarketStatus,
  FAILURE_THRESHOLD,
} from "../domain/index.js";
import type {
  Quote,
  MarketStatus,
  InstrumentMeta,
  KlineInterval,
  Candle,
  FeedHealth,
} from "../domain/index.js";

/**
 * usecase/quoteFeed — the core application orchestration for the live feed.
 *
 * `TwseFeed` polls MIS (via the injected `misClient` adapter), normalizes the
 * payload with pure `domain/` helpers, writes the snapshot/history, folds ticks
 * into intraday candles (via the injected `candleStore`), and re-emits
 * "quote"/"market"/"candle" events. After a run of failed polls it fills any
 * symbol that still has NO snapshot with the official daily close (via the
 * injected `officialFallback` cache) — never overwriting live/last-known data.
 *
 * Every external dependency (misClient, officialFallback, candleStore,
 * watchlist, provider) is injected so the feed is testable with fakes and never
 * `new`s an adapter itself (the composition root wires the real ones).
 */

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
  /** Official daily-close fallback (defaults to a real one when omitted). */
  officialFallback?: OfficialCloseCache;
  /** MIS real-time quote adapter (defaults to a real one when omitted). */
  misClient?: MisClient;
}

/** Consecutive failed polls before the official-close fallback kicks in. */
const FALLBACK_AFTER_FAILURES = FAILURE_THRESHOLD;

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
  private readonly officialFallback: OfficialCloseCache;
  private readonly misClient: MisClient;
  private marketLabel: string;

  // Health/observability state.
  private consecutiveFailures = 0;
  private lastTickAt = 0; // epoch ms of the last successful MIS poll with quotes
  private lastError: string | null = null;
  private fallbackActive = false; // true while serving official-close fallback

  constructor(deps: TwseFeedDeps) {
    super();
    this.watchlist = deps.watchlist;
    this.provider = deps.provider;
    this.viewed = deps.viewed;
    this.candleStore = deps.candleStore;
    this.officialFallback = deps.officialFallback ?? new OfficialCloseCache();
    this.misClient = deps.misClient ?? createMisClient();
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
        // The MIS network boundary lives in adapters/misClient — it returns the
        // raw JSON body (or null on a non-2xx batch, which we skip exactly as the
        // old `continue` did) and throws on transport/timeout so the catch below
        // records lastError. Parsing stays a pure domain call.
        const json = await this.misClient.fetchBatch(batch, now);
        if (json == null) continue;
        const quotes = parseMisResponse(
          json,
          metaBySymbol,
          this.prevPrices,
          now,
        );
        for (const q of quotes) merged.push(q);
      }
      this.ingest(merged, instruments);
      // A poll "succeeds" only when it actually delivered quotes; an empty
      // merge (all batches HTTP-failed, or MIS returned nothing) counts as a
      // failure so the official-close fallback can engage.
      if (merged.length > 0) {
        this.consecutiveFailures = 0;
        this.lastTickAt = now;
        this.lastError = null;
        this.fallbackActive = false;
      } else if (instruments.length > 0) {
        this.consecutiveFailures += 1;
      }
    } catch (err) {
      console.error("[twseFeed] poll error:", err);
      this.lastError = err instanceof Error ? err.message : String(err);
      if (instruments.length > 0) this.consecutiveFailures += 1;
    }

    // After a run of failed polls, fill any symbol that has NO snapshot yet with
    // the official daily close — so a cold start while MIS is down shows an
    // official number instead of a blank cell. Never overwrites live/last-known
    // MIS data (only fills holes).
    if (this.consecutiveFailures >= FALLBACK_AFTER_FAILURES) {
      await this.applyOfficialFallback(instruments, now);
    }

    this.refreshMarket(now);
  }

  /**
   * Fill snapshot holes from the official daily-close cache. Only touches
   * symbols without an existing snapshot, so it never clobbers live MIS data.
   */
  private async applyOfficialFallback(
    instruments: InstrumentMeta[],
    now: number,
  ): Promise<void> {
    const missing = instruments.filter((m) => !this.snapshot.has(m.symbol));
    if (missing.length === 0) return;

    const map = await this.officialFallback.getMap(now);
    if (map.size === 0) return;

    let filled = 0;
    for (const meta of missing) {
      const row = map.get(meta.symbol);
      if (row == null) continue;
      const quote = parseStockDayAllRow(row, meta, now);
      if (quote == null) continue;
      this.snapshot.set(meta.symbol, quote);
      if (quote.price != null) this.prevPrices.set(meta.symbol, quote.price);
      this.emit("quote", quote);
      filled += 1;
    }
    if (filled > 0) {
      this.fallbackActive = true;
      console.warn(
        `[twseFeed] MIS unavailable (${this.consecutiveFailures} fails) — ` +
          `served official close for ${filled} symbol(s)`,
      );
    }
  }

  /** Point-in-time feed health for the /api/health dashboard. */
  getHealth(now: number = Date.now()): FeedHealth {
    return {
      consecutiveFailures: this.consecutiveFailures,
      lastTickAt: this.lastTickAt,
      lastTickAgeMs: this.lastTickAt === 0 ? null : now - this.lastTickAt,
      lastError: this.lastError,
      fallbackActive: this.fallbackActive,
      activeSymbols: this.getActiveSymbols().length,
      snapshotCount: this.snapshot.size,
      officialCache: {
        size: this.officialFallback.size,
        ageMs: Number.isFinite(this.officialFallback.ageMs(now))
          ? this.officialFallback.ageMs(now)
          : null,
      },
    };
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
