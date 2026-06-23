# 即時交易台 — Build Contract (read this first)

Real-time **Taiwan stock** trading desk. Two components:

- `server/` — Node + TypeScript + Express + `ws`. Polls the TWSE MIS real-time quote
  API, normalizes ticks, broadcasts over WebSocket, exposes REST.
- `web/` — Nuxt 3 (Vue 3 `<script setup lang="ts">`) dark-theme UI.

**This file is the single source of truth.** Every signature, field name, and prop
below is fixed. Do not invent alternative names. Honor it exactly so the independently
built modules link up.

---

## Non-negotiable domain rules

1. **紅漲綠跌 (Taiwan convention): 漲 = RED, 跌 = GREEN.** Opposite of US markets.
   Use CSS vars `--up` (red) and `--down` (green) from `web/assets/css/theme.css`.
   `Direction = "up" | "down" | "flat"`; `"up"` → red, `"down"` → green.
2. **單位 (units):** prices in TWD; volume/size in **張** (1 張 = 1000 股, `SHARES_PER_LOT`).
3. **Market hours:** TPE (UTC+8, no DST), regular session **09:00–13:30 Mon–Fri**.
   `pre` = 08:30–09:00, `open` = 09:00–13:30, otherwise `closed` (incl. weekends).
4. **No API key.** The TWSE MIS endpoint is public. Never hardcode secrets.
5. Immutable updates, small focused files, explicit error handling (per repo style).

---

## TWSE MIS quote API (the external data source)

Endpoint (GET): `https://mis.twse.com.tw/stock/api/getStockInfo.jsp`

Query params:
- `ex_ch` = instruments joined by `|`, each `${exch}_${symbol}.tw` e.g.
  `tse_2330.tw|tse_2317.tw`. **URL-encode** the `|` (`%7C`) — build with `URLSearchParams`.
- `json=1`, `delay=0`, `_=<epoch ms cache-buster>`.

Required headers (the endpoint rejects bare clients):
- `User-Agent: Mozilla/5.0 (...)` (any browser-like UA)
- `Referer: https://mis.twse.com.tw/stock/index.jsp`

Response shape: `{ rtcode: string, msgArray: MisItem[], ... }`. `rtcode === "0000"` = OK.

### MisItem field map (only the fields we use)

| MIS field | Meaning              | Quote field                   | Parse rule |
|-----------|----------------------|-------------------------------|------------|
| `c`       | 代號                  | `symbol`                      | string |
| `n`       | 簡稱                  | `name`                        | string |
| `nf`      | 全名                  | `fullName`                    | string |
| `ex`      | 市場別 tse/otc        | `exch`                        | string |
| `z`       | 最新成交價            | `price`                       | num or **null** if `"-"`/empty |
| `y`       | 昨收                  | `prevClose`                   | num |
| `o`       | 開盤                  | `open`                        | num/null |
| `h`       | 最高                  | `high`                        | num/null |
| `l`       | 最低                  | `low`                         | num/null |
| `u`       | 漲停價                | `limitUp`                     | num/null |
| `w`       | 跌停價                | `limitDown`                   | num/null |
| `v`       | 累積成交量(張)         | `volume`                      | int (default 0) |
| `tv`      | 當盤成交量            | `lastVolume`                  | int (default 0) |
| `a`       | 五檔賣價(升冪)         | `asks[].price`                | `_`-split, drop empties, parseFloat |
| `f`       | 五檔賣量(張)          | `asks[].size`                 | `_`-split, drop empties, parseInt |
| `b`       | 五檔買價(降冪)         | `bids[].price`                | `_`-split, drop empties, parseFloat |
| `g`       | 五檔買量(張)          | `bids[].size`                 | `_`-split, drop empties, parseInt |
| `t`       | 時間 HH:MM:SS         | `time`                        | string |
| `tlong`   | epoch ms             | `tlong`                       | int |

Parsing helpers (define locally):
- `numOrNull(v)`: `v === "-" || v == null || v.trim() === ""` → `null`; else `parseFloat`
  (return `null` if `NaN`).
- Levels: zip price[] with size[] to `min(length)`; each `{ price, size }`. `a`/`f` → `asks`
  (ascending), `b`/`g` → `bids` (descending). Trailing `_` yields empty trailing item — drop it.
- **Price resolution (IMPORTANT — `z` is often `"-"` mid-session):** the resolved `price`
  is the first non-null of this chain:
  `numOrNull(z)` → `numOrNull(pz)` (前一筆成交) → `prevPrice` (carried last resolved price,
  passed in) → bid/ask **midpoint** `(bestBid + bestAsk) / 2` → `numOrNull(o)` →
  `numOrNull(y)` (prevClose). Only `null` if literally everything is missing. This keeps a
  live number on screen even between matches. `bestBid` = `bids[0].price`,
  `bestAsk` = `asks[0].price` (after parsing).
- `change`: `price == null ? 0 : price - prevClose`.
- `changePercent`: `prevClose ? change / prevClose * 100 : 0`.
- `direction` (vs `prevClose`): `price == null` → `"flat"`; `> prevClose` → `"up"`;
  `< prevClose` → `"down"`; else `"flat"`.
- `tick` (vs `prevPrice`, the previously resolved/broadcast price for this symbol): `> prevPrice`
  → `"up"`; `< prevPrice` → `"down"`; `"flat"` if no prior or equal. (Drives the flash only when
  the resolved price actually moved.)
- `updatedAt`: `now` (epoch ms passed in).
- A real captured payload (all `z === "-"`, populated book/o/h/l/y) lives at
  `server/test/fixtures/mis-sample.json` — BE-test should assert against it.

---

## Wire types

Canonical: `server/src/types.ts`. Frontend mirror: `web/types/index.ts`. **Read them.**
Do not redefine these types; import them.

---

## Backend module contracts (`server/src`)

`config.ts` (already written) exports `config` (with `config.instruments: InstrumentMeta[]`,
`config.port`, `config.twseBaseUrl`, `config.pollIntervalMs`, `config.historyLength`,
`config.corsOrigin`, `config.session`) and `INSTRUMENTS`. **Import, don't duplicate.**

### `twseFeed.ts` — owner: BE-feed

Pure, unit-testable functions (no network, no timers) PLUS the live feed class.

```ts
import { EventEmitter } from "node:events";
import type { Quote, MarketStatus, InstrumentMeta } from "./types.js";

// pure ↓ (these are what the tests import)
export function buildExCh(instruments: InstrumentMeta[]): string; // "tse_2330.tw|tse_2317.tw"
export function numOrNull(v: unknown): number | null;
export function parseLevels(
  priceStr: string | undefined,
  sizeStr: string | undefined,
): { price: number; size: number }[];
export function parseMisItem(
  item: Record<string, unknown>,
  meta: InstrumentMeta | undefined,
  prevPrice: number | null,
  now: number,
): Quote;
export function parseMisResponse(
  json: unknown,
  metaBySymbol: Map<string, InstrumentMeta>,
  prevPrices: Map<string, number | null>,
  now: number,
): Quote[]; // ignores items with no symbol; tolerates missing msgArray
export function computeMarketStatus(now: number): MarketStatus; // uses config.session, TPE offset

// live feed ↓
export interface TwseFeedEvents {
  quote: (q: Quote) => void;
  market: (m: MarketStatus) => void;
}
export class TwseFeed extends EventEmitter {
  start(): void;            // begins polling every config.pollIntervalMs (poll once immediately)
  stop(): void;            // clears timer
  getSnapshot(): Quote[];  // latest quote per instrument, in config order
  getHistory(): Record<string, number[]>; // symbol -> rolling price[] (<= config.historyLength)
  getMarket(): MarketStatus;
  // emits "quote" per changed instrument each poll; emits "market" when session changes
}
```

Feed behavior: one batched `fetch` for all instruments per poll (UA + Referer headers,
cache-buster). On parse, push `price` (when non-null) into rolling history (cap
`config.historyLength`, immutable slice). Track prev broadcast price per symbol for `tick`.
Emit `quote` for each instrument on every successful poll. Wrap fetch/JSON in try/catch;
log and continue (never crash the process). Recompute & emit `market` when the session
label changes.

### `wsServer.ts` — owner: BE-wire

```ts
import type { Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import type { TwseFeed } from "./twseFeed.js";
export function createWsServer(httpServer: HttpServer, feed: TwseFeed): WebSocketServer;
```
Attach `WebSocketServer` on path `/ws`. On connection: send `{type:"snapshot", quotes,
market, history}` (a `ServerMessage`). Subscribe to feed `quote`/`market` events and send
`{type:"quote",quote}` / `{type:"market",market}` to all open clients. Handle client
`{type:"ping"}` (reply nothing or a pong — optional). Clean up listeners on close. Use a
heartbeat (`ws.ping`) to drop dead clients.

### `restApi.ts` — owner: BE-wire

```ts
import { Router } from "express";
import type { TwseFeed } from "./twseFeed.js";
export function createApiRouter(feed: TwseFeed): Router;
```
Routes (all JSON): `GET /instruments` → `{ instruments }`; `GET /quotes` →
`{ quotes, market }`; `GET /history/:symbol` → `{ symbol, points: number[] }` (404 if
unknown); `GET /market` → `MarketStatus`; `GET /health` → `{ ok: true, uptime }`.

### `index.ts` — owner: BE-wire

Bootstrap: create `express()`, `cors({ origin: config.corsOrigin })`, `express.json()`,
mount `createApiRouter(feed)` at `/api`, create `http.createServer(app)`,
`createWsServer(server, feed)`, `feed.start()`, `server.listen(config.port)` with a startup
log. Handle `SIGINT`/`SIGTERM`: `feed.stop()`, close server, exit. Single `TwseFeed` instance.

---

## Frontend contracts (`web/`)

Nuxt auto-imports `components/*` and `composables/*` and `utils/*` — no manual imports
needed for those in SFCs. Use `<script setup lang="ts">`. Import shared types from `~/types`.

### `utils/format.ts` — owner: FE-data  (pure, no Vue)

```ts
import type { Direction } from "~/types";
export function formatPrice(n: number | null, dp = 2): string;   // "265.00" | "—"
export function formatChange(n: number, dp = 2): string;         // "+1.50" | "-1.50" | "0.00"
export function formatPercent(n: number, dp = 2): string;        // "+0.57%" | "-0.57%"
export function formatVolume(n: number): string;                 // "17,575"
export function formatInt(n: number): string;                    // thousands separated
export function formatTime(epochMs: number): string;             // "HH:MM:SS" (TPE)
export function signClass(d: Direction): string;                 // "c-up" | "c-down" | "c-flat"
export function arrow(d: Direction): string;                     // "▲" | "▼" | "—"
export function directionOf(n: number): Direction;               // sign → direction
```

### `utils/positions.ts` — owner: FE-data  (pure, no Vue)

```ts
import type { Position, OrderRequest, Quote } from "~/types";
// immutable; lots in 張, shares = lots * SHARES_PER_LOT
export function applyOrder(
  positions: Record<string, Position>, order: OrderRequest,
): Record<string, Position>;        // weighted avg on adds; books realized on reduce/flip
export function closeAtPrice(
  positions: Record<string, Position>, symbol: string, price: number,
): Record<string, Position>;         // flatten lots to 0, book realized
export function unrealizedPnl(position: Position, currentPrice: number | null): number; // TWD
export function totalUnrealized(
  positions: Record<string, Position>, quotes: Record<string, Quote>,
): number;
export function totalRealized(positions: Record<string, Position>): number;
```
P&L: `(currentPrice - avgPrice) * lots * SHARES_PER_LOT`. Realized booked when an order
reduces/closes/flips a position: `(fillPrice - avgPrice) * closedShares * sign(oldLots)`.

### `composables/useApi.ts` — owner: FE-data

```ts
// reads useRuntimeConfig().public.{apiBase,wsUrl}
export function useApi(): {
  apiBase: string; wsUrl: string;
  fetchInstruments(): Promise<InstrumentMeta[]>;
  fetchQuotes(): Promise<{ quotes: Quote[]; market: MarketStatus }>;
  fetchHistory(symbol: string): Promise<number[]>;
};
```

### `composables/useMarketData.ts` — owner: FE-data  (SINGLETON)

Module-level shared reactive state; connect the WebSocket once, on client only
(`import.meta.client`). Returns:

```ts
export function useMarketData(): {
  quotes: Ref<Record<string, Quote>>;
  order: Ref<string[]>;
  history: Ref<Record<string, number[]>>;
  market: Ref<MarketStatus | null>;
  connection: Ref<ConnectionState>;
  selected: Ref<string>;
  selectedQuote: ComputedRef<Quote | null>;
  selectedHistory: ComputedRef<number[]>;
  recentTicks: Ref<Tick[]>;     // selected symbol only, newest first, cap 40
  serverTime: Ref<number>;
  select: (symbol: string) => void;
};
```
On `snapshot`: fill quotes/order/history/market, default `selected` = first symbol if unset,
`connection="open"`. On `quote`: replace `quotes[sym]` (new object), append `price` to
`history[sym]` (cap by length of incoming or 120), bump `serverTime`; if `sym === selected`
and `price != null`, unshift a `Tick` onto `recentTicks` (cap 40). On `market`: update
market + serverTime. Reconnect with capped backoff; set `connection` accordingly.
Guard everything so SSR render is safe (no `window`/`WebSocket` on server).

### `composables/usePositions.ts` — owner: FE-data  (SINGLETON)

```ts
export function usePositions(): {
  positions: Ref<Record<string, Position>>;
  submitOrder: (o: OrderRequest) => void;       // delegates to applyOrder
  closePosition: (symbol: string, price: number) => void;
  totalUnrealized: (quotes: Record<string, Quote>) => number;
  totalRealized: ComputedRef<number>;
};
```

### Components (`web/components/*.vue`)

All use `<script setup lang="ts">`, pull live data from the composables above, and read
shared types from `~/types`. Coloring uses `signClass`/`--up`/`--down` (紅漲綠跌).
Layout/grid classes live in `web/assets/css/app.css`; component-specific styling may use
`<style scoped>`.

| Component            | Props                                              | Emits            | Data source |
|---------------------|----------------------------------------------------|------------------|-------------|
| `TopBar`            | —                                                  | —                | useMarketData + usePositions (品牌、台北時間、市場狀態、連線、總損益) |
| `MarketStatus`      | `market: MarketStatus \| null`                     | —                | prop |
| `ConnectionBadge`   | `state: ConnectionState`                           | —                | prop |
| `WatchlistGrid`     | —                                                  | —                | useMarketData; renders `PriceCard` per `order`, passes `:quote` `:active`, handles `@select` → `select()` |
| `PriceCard`         | `quote: Quote`, `active: boolean`                  | `select: string` | prop; flash on `quote.tick` |
| `DetailPanel`       | —                                                  | —                | useMarketData.selectedQuote/selectedHistory; embeds `Sparkline` |
| `Sparkline`         | `data: number[]`, `direction: Direction`, `width?: number`, `height?: number`, `baseline?: number \| null` | — | prop (pure SVG area+line) |
| `OrderBook`         | —                                                  | —                | useMarketData.selectedQuote → 五檔 (asks desc on top, bids below) with depth bars |
| `TickTape`          | —                                                  | —                | useMarketData.recentTicks |
| `OrderTicket`       | —                                                  | —                | useMarketData.selectedQuote + usePositions.submitOrder; 買進(red)/賣出(green), lots(張)+price inputs |
| `PositionsBlotter`  | —                                                  | —                | usePositions + useMarketData.quotes; table + 平倉 → closePosition |

`app.vue` (written by the integrator) lays these out in a dashboard grid. Component tag
names above are the exact auto-import names — match filenames precisely.

---

## File ownership (no two agents touch the same file)

- **BE-feed:** `server/src/twseFeed.ts`
- **BE-wire:** `server/src/wsServer.ts`, `server/src/restApi.ts`, `server/src/index.ts`
- **BE-test:** `server/test/twseFeed.test.ts`
- **FE-data:** `web/utils/format.ts`, `web/utils/positions.ts`, `web/composables/useApi.ts`, `web/composables/useMarketData.ts`, `web/composables/usePositions.ts`
- **FE-comp-a:** `web/components/{TopBar,MarketStatus,ConnectionBadge,WatchlistGrid,PriceCard}.vue`
- **FE-comp-b:** `web/components/{DetailPanel,Sparkline}.vue`
- **FE-comp-c:** `web/components/{OrderBook,TickTape}.vue`
- **FE-comp-d:** `web/components/{OrderTicket,PositionsBlotter}.vue`
- **FE-style:** `web/assets/css/app.css`
- **FE-test:** `web/test/format.test.ts`, `web/test/positions.test.ts`

Already written (do not modify): all config files, `server/src/{types,config}.ts`,
`web/types/index.ts`, `web/assets/css/theme.css`, `web/app.vue`.
