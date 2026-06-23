/**
 * Singleton live-market data store backed by the backend WebSocket.
 * Module-scoped reactive state shared across every caller. The socket is
 * opened lazily, exactly once, on the client only (SSR-safe).
 */
import { ref, computed, type Ref, type ComputedRef } from "vue";
import type {
  Quote,
  MarketStatus,
  ConnectionState,
  ServerMessage,
  ClientMessage,
  Tick,
  Candle,
  KlineInterval,
} from "~/types";

/** The latest live candle event (the forming or just-closed bar), with the
 * symbol/interval it belongs to so consumers can match it to their context. */
export interface CandleEvent {
  symbol: string;
  interval: KlineInterval;
  candle: Candle;
  closed: boolean;
}

const HISTORY_CAP = 120;
const TICKS_CAP = 40;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 15000;

// ── module-scoped reactive state (shared singleton) ──
const quotes: Ref<Record<string, Quote>> = ref({});
// The persisted watchlist (自選股) — the authoritative membership for the grid,
// independent of the WS snapshot's "active set" (which ALSO carries transiently
// viewed symbols, so it must not drive the grid or the ✕ would hit symbols the
// user never added). Loaded once from REST on init, then kept in sync by
// add/remove with optimistic updates.
const watchlist: Ref<string[]> = ref([]);
const history: Ref<Record<string, number[]>> = ref({});
const market: Ref<MarketStatus | null> = ref(null);
const connection: Ref<ConnectionState> = ref("connecting");
const selected: Ref<string> = ref("");
const recentTicks: Ref<Tick[]> = ref([]);
// NaN until the first server message; formatTime renders "--:--:--" for non-finite,
// so the clock never shows a fabricated epoch time on first paint.
const serverTime: Ref<number> = ref(NaN);
// Latest live candle event from the backend (null until the first one arrives).
// useKlines watches this and folds matching events into its forming bar.
const lastCandle: Ref<CandleEvent | null> = ref(null);
// Wall-clock epoch ms of the most recent quote tick (NaN until the first one).
// Freshness consumers compare this against the wall clock to detect stale feeds.
const lastTickAt: Ref<number> = ref(NaN);

// ── module-scoped non-reactive connection bookkeeping ──
let socket: WebSocket | null = null;
let connectStarted = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let tickSeq = 0; // stable monotonic id per printed tick (for transition-group keys)

const selectedQuote: ComputedRef<Quote | null> = computed(
  () => quotes.value[selected.value] ?? null,
);
const selectedHistory: ComputedRef<number[]> = computed(
  () => history.value[selected.value] ?? [],
);

/** Apply a full snapshot message immutably. */
function applySnapshot(
  msgQuotes: Quote[],
  msgMarket: MarketStatus,
  msgHistory: Record<string, number[]>,
): void {
  const nextQuotes: Record<string, Quote> = {};
  const nextOrder: string[] = [];
  for (const q of msgQuotes) {
    nextQuotes[q.symbol] = q;
    nextOrder.push(q.symbol);
  }
  quotes.value = nextQuotes;
  history.value = { ...msgHistory };
  market.value = msgMarket;
  serverTime.value = msgMarket.serverTime;
  if (!selected.value && nextOrder.length > 0) {
    const first = nextOrder[0];
    if (first !== undefined) selected.value = first;
  }
  connection.value = "open";
}

/** Apply a single live quote message immutably. */
function applyQuote(q: Quote): void {
  quotes.value = { ...quotes.value, [q.symbol]: q };
  // Record wall-clock arrival time of this tick for freshness detection.
  lastTickAt.value = Date.now();

  if (q.price !== null) {
    const prior = history.value[q.symbol] ?? [];
    const appended = [...prior, q.price];
    const capped =
      appended.length > HISTORY_CAP
        ? appended.slice(appended.length - HISTORY_CAP)
        : appended;
    history.value = { ...history.value, [q.symbol]: capped };
  }

  serverTime.value = q.updatedAt;

  if (q.symbol === selected.value && q.price !== null) {
    const tick: Tick = {
      id: tickSeq++,
      symbol: q.symbol,
      price: q.price,
      size: q.lastVolume,
      direction: q.tick,
      time: q.time,
    };
    const next = [tick, ...recentTicks.value];
    recentTicks.value =
      next.length > TICKS_CAP ? next.slice(0, TICKS_CAP) : next;
  }
}

/** Apply a market-status message. */
function applyMarket(m: MarketStatus): void {
  market.value = m;
  serverTime.value = m.serverTime;
}

/** Apply a live candle message: publish it for useKlines to fold. */
function applyCandle(
  symbol: string,
  interval: KlineInterval,
  candle: Candle,
  closed: boolean,
): void {
  lastCandle.value = { symbol, interval, candle, closed };
}

/** Route a parsed server message to the right reducer. */
function handleMessage(raw: string): void {
  let msg: ServerMessage;
  try {
    msg = JSON.parse(raw) as ServerMessage;
  } catch (error) {
    console.error("useMarketData: bad message", error);
    return;
  }
  if (msg.type === "snapshot") {
    applySnapshot(msg.quotes, msg.market, msg.history);
  } else if (msg.type === "quote") {
    applyQuote(msg.quote);
  } else if (msg.type === "market") {
    applyMarket(msg.market);
  } else if (msg.type === "candle") {
    applyCandle(msg.symbol, msg.interval, msg.candle, msg.closed);
  }
}

/** Schedule a reconnect with capped exponential backoff (1s,2s,4s,8s,…,15s). */
function scheduleReconnect(): void {
  if (reconnectTimer !== null) return;
  const delay = Math.min(
    BACKOFF_BASE_MS * 2 ** reconnectAttempts,
    BACKOFF_MAX_MS,
  );
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

/** Open the WebSocket. Client-only; safe to call repeatedly. */
function connect(): void {
  if (!import.meta.client) return;
  if (typeof WebSocket === "undefined") return;
  if (socket && socket.readyState === WebSocket.OPEN) return;

  const cfg = useRuntimeConfig().public;
  // Derive ws/wss by page protocol so an https deploy doesn't get mixed-content
  // blocked, and a relative wsUrl resolves against the current origin (PQ-8).
  const wsUrl = resolveWsUrl({ apiBase: cfg.apiBase, wsUrl: cfg.wsUrl });
  connection.value = "connecting";

  let ws: WebSocket;
  try {
    ws = new WebSocket(wsUrl);
  } catch (error) {
    console.error("useMarketData: socket open failed", error);
    scheduleReconnect();
    return;
  }
  socket = ws;

  ws.onopen = () => {
    connection.value = "open";
    reconnectAttempts = 0;
  };
  ws.onmessage = (ev: MessageEvent) => {
    if (typeof ev.data === "string") handleMessage(ev.data);
  };
  ws.onclose = () => {
    connection.value = "closed";
    if (socket === ws) socket = null;
    scheduleReconnect();
  };
  ws.onerror = () => {
    connection.value = "closed";
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  };
}

/**
 * Tell the backend to subscribe to `symbol` on demand. No-op if the socket is
 * still connecting / closed — the snapshot on (re)connect carries the active
 * set anyway, and selected symbols are folded into the poll set server-side.
 */
function sendView(symbol: string): void {
  if (!symbol) return;
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      const msg: ClientMessage = { type: "view", symbol };
      socket.send(JSON.stringify(msg));
    } catch (error) {
      console.error("useMarketData: view send failed", error);
    }
  }
}

/** Select a watchlist symbol; clears the per-symbol tick tape. */
function select(symbol: string): void {
  selected.value = symbol;
  recentTicks.value = [];
  sendView(symbol);
}

// Load the persisted watchlist exactly once; reused by add/remove so a PUT can
// never race ahead of the initial load and clobber the stored list with [].
let watchlistInit: Promise<void> | null = null;
function ensureWatchlistLoaded(): Promise<void> {
  if (watchlistInit) return watchlistInit;
  const { getWatchlist } = useApi();
  watchlistInit = getWatchlist()
    .then(({ symbols }) => {
      watchlist.value = symbols;
    })
    .catch((error) => {
      console.error("useMarketData: loadWatchlist failed", error);
    });
  return watchlistInit;
}

/**
 * Add `symbol` to the watchlist. Optimistically appends it (a placeholder card
 * renders until its first quote arrives) and focuses it, so the grid responds
 * instantly even with the market closed (no corrective snapshot is coming).
 * select() also sendView()s so the backend starts polling it. The PUT persists
 * the full list; its authoritative response reconciles membership.
 */
async function addToWatchlist(symbol: string): Promise<void> {
  if (!symbol) return;
  await ensureWatchlistLoaded();
  if (!watchlist.value.includes(symbol)) {
    watchlist.value = [...watchlist.value, symbol];
  }
  select(symbol);

  const { putWatchlist } = useApi();
  const { symbols } = await putWatchlist(watchlist.value);
  watchlist.value = symbols;
}

/**
 * Remove `symbol` from the watchlist. Optimistically drops it (re-focusing the
 * first remaining symbol if it was the selected one) so the card disappears the
 * instant the ✕ is clicked — the backend never pushes a corrective snapshot
 * while the market is closed, so waiting on the server leaves the click looking
 * dead. The PUT persists the reduced list; its response reconciles membership.
 */
async function removeFromWatchlist(symbol: string): Promise<void> {
  if (!symbol) return;
  await ensureWatchlistLoaded();
  if (!watchlist.value.includes(symbol)) return;

  watchlist.value = watchlist.value.filter((s) => s !== symbol);
  if (selected.value === symbol) {
    const fallback = watchlist.value[0] ?? "";
    selected.value = fallback;
    recentTicks.value = [];
    if (fallback) sendView(fallback);
  }

  const { putWatchlist } = useApi();
  const { symbols } = await putWatchlist(watchlist.value);
  watchlist.value = symbols;
}

/** Tear down the socket + reconnect timer (programmatic teardown / dev HMR). */
function disconnect(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    try {
      socket.close();
    } catch {
      /* ignore */
    }
    socket = null;
  }
  connectStarted = false;
  reconnectAttempts = 0;
  connection.value = "closed";
}

// Dispose the singleton socket across hot reloads so dev HMR doesn't leak sockets.
if (import.meta.hot) {
  import.meta.hot.dispose(() => disconnect());
}

export function useMarketData(): {
  quotes: Ref<Record<string, Quote>>;
  watchlist: Ref<string[]>;
  history: Ref<Record<string, number[]>>;
  market: Ref<MarketStatus | null>;
  connection: Ref<ConnectionState>;
  selected: Ref<string>;
  selectedQuote: ComputedRef<Quote | null>;
  selectedHistory: ComputedRef<number[]>;
  recentTicks: Ref<Tick[]>;
  serverTime: Ref<number>;
  lastCandle: Ref<CandleEvent | null>;
  lastTickAt: Ref<number>;
  select: (symbol: string) => void;
  addToWatchlist: (symbol: string) => Promise<void>;
  removeFromWatchlist: (symbol: string) => Promise<void>;
  disconnect: () => void;
} {
  if (import.meta.client && !connectStarted) {
    connectStarted = true;
    connect();
    void ensureWatchlistLoaded();
  }
  return {
    quotes,
    watchlist,
    history,
    market,
    connection,
    selected,
    selectedQuote,
    selectedHistory,
    recentTicks,
    serverTime,
    lastCandle,
    lastTickAt,
    select,
    addToWatchlist,
    removeFromWatchlist,
    disconnect,
  };
}
