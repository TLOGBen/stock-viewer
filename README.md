# 即時交易台 · Taiwan Real-Time Trading Desk

A full-stack, real-time **Taiwan stock trading desk**. Live quotes stream from the official
**TWSE MIS** real-time API (no API key), the full listed/OTC/ETF universe is searchable, and
the desk renders as an **institutional-terminal** dark UI: tabular-mono numbers, hairline
panels, real K-line charts, depth & volume-profile visualizations, and a fee-aware mock order
ticket with live P&L.

Built with **Nuxt 3 (Vue 3 + TypeScript)** on the front end and a **Node + Express + ws**
market-data service on the back end.

> 紅漲綠跌 — colors follow the Taiwan convention: **red = up (漲), green = down (跌).**

> ⚠️ Mock/demo only. Order entry routes nowhere; nothing here is investment advice.

---

## Features

- **Live market data** — TWSE MIS poll (~3.5s), normalized to canonical `Quote`s, broadcast
  over WebSocket with snapshot + per-tick updates and a price-flash animation.
- **Full-market search & dynamic watchlist** — the whole 上市 + 上櫃 + ETF/權證 universe
  (key-free TWSE/TPEx OpenAPI directories) is searchable; add/remove watchlist symbols, which
  are **persisted on the backend** (`server/data/watchlist.json`).
- **Multi-page navigation** — 看盤 (trading floor) · 個股 (single-stock research, deep-linkable
  `/stock/:symbol`) · 持倉 (positions / P&L) · 市場 (sector heatmap + movers).
- **Real K-line charts** — [KLineChart](https://klinecharts.com): 1m/5m/15m/日/週/月, candle /
  hollow / line / area / 美國線 / 平均足, MA/EMA/BOLL/VOL/MACD/RSI/KDJ indicators, fullscreen.
- **D3 visualizations** — 五檔 depth chart, volume-profile (POC), and a turnover-weighted
  sector heatmap.
- **Fee-aware mock order ticket** — 限價/市價, 張/股 units (1 張 = 1000 股), Taiwan tick-size
  ladder, 手續費 + 交易稅 estimate, and 張-based position P&L (realized + unrealized).
- **Quality layer** — data-freshness / connection / 漲跌停 badges, market-session awareness,
  WCAG-AA contrast, reduced-motion support, 174 unit tests.

## Architecture

```
TWSE MIS  ──poll(3.5s)──►┐
TWSE/TPEx OpenAPI ──────►│  server/ (Express + ws + TS)  ──WebSocket /ws──►  web/ (Nuxt 3)
  (universe directory)   │  normalize → cache → broadcast   ◄──REST /api──   看盤/個股/持倉/市場
                         ┘  watchlist + k-line file cache
```

- **`server/`** — polls the dynamic active set (watchlist ∪ on-demand views) in batched MIS
  requests, builds the searchable universe (cached on disk), folds intraday candles + caches
  daily STOCK_DAY history, and serves REST (`/api/quotes`, `/search`, `/watchlist`,
  `/klines/:symbol`, `/stats/:symbol`, …) plus the `/ws` stream.
- **`web/`** — Nuxt dark-terminal app; live state flows through singleton composables
  (`useMarketData` / `usePositions`) so the WebSocket and selection survive page navigation.
  Self-hosted fonts (JetBrains Mono for numbers, Noto Sans TC for UI).

---

## Quick start

**Prerequisites:** Node.js ≥ 20 and npm.

Install dependencies (once, in each package):

```bash
cd server && npm install
cd ../web  && npm install
```

Run in **development** (two terminals, hot-reload):

```bash
# Terminal 1 — backend  (http://127.0.0.1:4000)
cd server && npm run dev

# Terminal 2 — frontend (http://localhost:3000)
cd web && npm run dev
```

Then open **http://localhost:3000**.

During Taiwan market hours (09:00–13:30 TPE, Mon–Fri) you'll see live ticks; outside hours the
desk shows the last session's snapshot with a 休市/收盤 badge (this is expected).

### Production build

```bash
# backend
cd server && npm run build && npm start          # tsc → node dist/index.js

# frontend
cd web && npm run build && node .output/server/index.mjs   # Nuxt → :3000
```

---

## Configuration

All settings are environment variables (no hardcoded secrets — the TWSE APIs need no key).

**Backend** (`server/`):

| Var | Default | Notes |
|-----|---------|-------|
| `HOST` | `127.0.0.1` | Bind address. Loopback by default so the desk isn't exposed to the LAN. **Set `0.0.0.0`** to serve the frontend/API from another machine or container. |
| `PORT` | `4000` | HTTP + WebSocket port. |
| `CORS_ORIGIN` | `*` | Lock to your frontend origin in shared deployments. |
| `POLL_INTERVAL_MS` | `3500` | Upstream poll cadence (TWSE is rate-sensitive — don't hammer it). |
| `TWSE_SYMBOLS` | (8 defaults) | Seed watchlist on first run, e.g. `"2330,2317,6488"`. |
| `DATA_DIR` | `server/data` | Where `universe.json` / `watchlist.json` / k-line cache live. |

**Frontend** (`web/`): `NUXT_PUBLIC_API_BASE` (default `http://localhost:4000`),
`NUXT_PUBLIC_WS_URL` (default `ws://localhost:4000/ws`).

> **Security default:** the backend binds **loopback (127.0.0.1)** so a single-user local desk
> isn't reachable from the network. Symbol inputs are validated at the API boundary (k-line /
> stats paths are traversal-guarded), the WebSocket caps payload size, and the on-demand view
> set is bounded. Expose to a network only intentionally via `HOST=0.0.0.0` + a locked
> `CORS_ORIGIN`.

---

## Test & build

```bash
cd server && npm test && npm run build      # vitest (88) + tsc
cd web    && npm test && npm run typecheck   # vitest (86) + vue-tsc
```

## Notes

- The TWSE MIS endpoint is public and rate-sensitive; default poll is 3.5s.
- `server/data/` (universe cache, persisted watchlist, k-line cache) is **git-ignored** and
  re-created automatically on first run.
- Order entry is a **mock** for P&L visualization only — no orders are routed anywhere.
- Market data is for demonstration and is **not investment advice**.
