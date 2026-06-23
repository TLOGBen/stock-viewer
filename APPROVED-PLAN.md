# APPROVED PLAN — 標準規格全 Phase 實作

> /think（6 子系統架構）+ /review（對抗式複審，verdict: **sound-with-fixes**）的交付物。
> 基準：[STANDARD-SPEC.md](./STANDARD-SPEC.md)（A–G ~63 條）、[SPEC-CONFORMANCE-REVIEW.md](./SPEC-CONFORMANCE-REVIEW.md)。
> 日期：2026-06-23。

## Building（要做什麼）

把展示型交易台升級為「可信台股看盤台」：使用者可**搜尋全市場（上市+上櫃+ETF/權證）任何標的**並**增刪自選股（後端持久化）**；主圖換成 **KLineChart 真 K 線**（蠟燭/折線/面積/HA/OHLC、時間週期切換、十字線 tooltip、縮放平移、量能與 MA/MACD/RSI/KD/BOLL 指標）；後端提供**多週期 K 線聚合 + 動態訂閱**；下單匣補**訂單種類/效期/手續費+證交稅/購買力/送單確認**；以 **D3** 補 Volume Profile、市場 Heatmap、五檔深度圖；全站補 tick-size 動態精度、資料鮮度/stale、無障礙與 WCAG AA。保留現有 WebSocket tick 管線、五檔、成交明細、損益、紅漲綠跌、響應式+重連。

## Not building（明確不做的事）

- **多使用者 / 登入帳號**：單一使用者模型；自選股後端單檔持久化，positions/cash 為 session-only（重載即清）。
- **真實下單路由**：下單與費用為模擬，不接券商 API、不送真單。
- **SubscriptionManager 的 view∪unview 暫態協定 + event bus**（reviewer 判為單人過度設計）：改為每次 poll 直接由 `watchlist ∪ selected` 重算 ex_ch。
- **ex_ch 多批次合併、per-symbol-per-month K 線快取、自選股分組 CRUD、CT-6 雙色 baseline overlay、PQ-4 全站 AsyncResult**：YAGNI / 延後；只在真正需要的熱點套用。
- **權證全量即時**：universe 目錄涵蓋上市+上櫃+ETF；權證以目錄收錄為主，逐檔即時行情視 MIS 支援而定（風險已記）。

## Approach（選了哪個方案及理由）

- **圖表**：採 KLineChart 9.x（Apache-2.0、內建 K線/指標/繪圖、reuse-first）為主圖；**D3 僅做 KLineChart 不擅長的 bespoke 視覺化**（Volume Profile、Heatmap treemap、深度圖）。已 pin `klinecharts@^9.8.12`、`d3@^7.9`。
- **Universe**：用兩個免金鑰 OpenAPI 目錄端點（TWSE `STOCK_DAY_ALL` + TPEx `tpex_mainboard_daily_close_quotes`）合併成 `Security[]`，落地 `server/data/universe.json` 快取（24h TTL + 每日刷新），手寫線性排序搜尋索引（免 fuse.js）。即時行情仍走現有 MIS poll。
- **動態訂閱**：poll 集合 = 後端 watchlist 檔 ∪ 當前 selected；`select()` 經 WS `{type:'view',symbol}`（送前 guard socket OPEN）告知後端按需訂閱。WS snapshot/quote/market 形狀**位元相容**，只是符號集合可變。
- **已接受邊界**：universe 目錄為日收盤快照（落後一交易日，新 IPO 隔日才入庫）；server 重啟丟失當日 intraday bars（日/週/月由 STOCK_DAY 回填）。

## Key decisions（關鍵決策 — 含 reviewer 修正的契約凍結）

1. **Candle wire 形狀凍結為** `{ timestamp:number; open;high;low;close; volume(張) }`（KLineChart KLineData 原生，免逐根 remap）。解掉 `time` vs `timestamp` 衝突。
2. **KlineInterval 凍結為** `'1m'|'5m'|'15m'|'D'|'W'|'M'`（wire 統一；UI label 另映）。解掉 `D` vs `1d` 衝突。
3. **tickSize 收斂為單一模組** `web/utils/tickSize.ts`：`tickSizeFor(price, kind:'stock'|'etf') -> {step,decimals}` + `roundToTick`；刪掉重複的 `utils/tick.ts`。後端鏡像 `server/src/tickSize.ts`。解掉三重定義。
4. **InstrumentMeta 收斂為單一 superset** `{symbol,name,exch,type?,lotSize?,isEtf?,isIndex?}`；`Security`=目錄列、`InstrumentMeta`=訂閱/meta superset（由 Security 衍生）。三處各自擴充改為一次定義。
5. **volume-fold 公式統一**：前端 forming-bar 與後端 bucketer 都用「累計成交量 delta（張）」，避免 rollover 時兩邊不一致。
6. **顯示精度 vs 下單檔位分離**：顯示沿用既有精度為主、下單 step 用 tickSize（避免既有 8 檔 >100 元由 2dp 變 1dp 的視覺回歸）。

## Unknowns（已知不知道的事）

- **lotSize / isEtf / sharesOutstanding / sector 來源**：兩個目錄端點不含這些。延後決定——先用 ETF/張數預設值（整股 1000 股、ETF 旗標由代號樣式推斷），市值/類股待找 TWSE 基本資料端點（t187ap03）；由 viz/order 階段決定，先以預設值上線。
- **權證即時來源**：延後；先確保目錄收錄，逐檔即時視 MIS `wt_` 支援度，Phase 6 再評估。
- **PQ-1 顯示位數是否跟隨 tick 位數**：先採「顯示固定、下單跟 tick」，若使用者要求再切換（決策 6 的可調點）。

---

## 建置順序（reviewer 排序，working increment 優先）

| Phase | 內容 | Spec | 風險 |
|------|------|------|------|
| **0** | **契約凍結**：types.ts/index.ts 補齊全部新型別（Candle/KlineInterval/Security/InstrumentMeta superset/OrderType/TIF/ServerMessage candle/ClientMessage view…）+ 單一 tickSize 模組 | 跨 | 無功能碼 |
| **1** | **AR-6 讀取側（純加法、零基準風險）**：universe sources/cache/searchIndex/provider、watchlist 檔 store、`/api/securities`·`/api/search`·`GET/PUT /api/watchlist`、useApi 方法、SecuritySearch.vue、WatchlistGrid 增刪 | AR-6(部分)/QM-13/QM-5 | 低 |
| **2** | **AR-6 動態 poll 集合切換（碰基準）**：twseFeed 改讀 watchlist∪selected、`{type:'view'}`、保留 INSTRUMENTS 為種子；切換後 smoke-test 7 項基準 | AR-6(完成) | 中 |
| **3** | **AR-2 後端 K 線（keystone）**：candleStore（1m+roll-up）、historyFetcher/Cache（STOCK_DAY）、`/api/klines/:symbol`、`candle` WS 變體 | AR-2/CT-1/3/IX-1/PQ-1 | 中 |
| **4** | **AR-1 KLineChart 前端**：KlineChart.client.vue、useKlines（history+forming-bar fold）、klineTheme（紅漲綠跌）、KlineToolbar、IndicatorPicker、DetailPanel 換圖；接 IN-1~4 指標 | AR-1/CT-1~6/IX-1~7/IN-1~5 | 中 |
| **5** | **TP 下單深化 + PQ 橫切**（並行）：訂單種類/TIF/fees/購買力/確認框；tickSize 精度、freshness/stale+牆鐘、limit lock、loading/error 狀態、a11y、WCAG AA、/stock/:symbol 路由、部署設定 | TP-*/PQ-* /QM-6 | 中 |
| **6** | **D3 進階視覺化**（最後、加法）：DepthChart(CT-7)、VolumeProfile(CT-8)、Heatmap(QM-10)、IndexBand(QM-11)、QM-2 stats；ingest 抽 per-tick hook 一次 | CT-7/8·QM-10/11/2 | 低 |

下一步：執行 **Phase 0 契約凍結**（由主控直接編輯共享型別檔，避免多寫者衝突），再分階段 /execute。
