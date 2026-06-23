# 標準規格符合度報告 (Spec Conformance Review)

> 基準：[`STANDARD-SPEC.md`](./STANDARD-SPEC.md)（由 `/learn` digest 固化）。
> 方法：6 領域獨立 agent 讀取規格 + 真實程式碼，逐條附 file:line 證據判定。
> 日期：2026-06-23。狀態：`✓ 已實作` / `◐ 部分` / `✗ 缺`。

## 總評分卡

| 領域 | ✓ 已實作 | ◐ 部分 | ✗ 缺 | 小計 |
|------|:---:|:---:|:---:|:---:|
| A. 圖表類型 (CT) | 1 | 1 | 7 | 9 |
| B. 圖表互動 (IX) | 0 | 1 | 9 | 10 |
| C. 技術指標 (IN) | 0 | 0 | 7 | 7 |
| D. 報價盤面 (QM) | 2 | 5 | 5 | 12 |
| E. 下單部位 (TP) | 1 | 2 | 6 | 9 |
| F. 架構函式庫 (AR) | 3¹ | 0 | 2 | 5 |
| **合計** | **7** | **9** | **36** | **52** |

¹ AR-5（響應式版面）原審判為「部分」，經複核 `app.vue` scoped styles 已含 `@media`（1200px/1700px）斷點 + 重連機制，更正為 ✓。
**P0 必備項（27 條）：✓7 ◐4 ✗16。**

## 一句話結論

**「即時資料骨幹」已紮實達標，「專業圖表 + 下單深度」幾乎是綠地。**
目前 ✓ 的 7 項全是最難造假的即時核心（WebSocket tick 驅動的報價列、五檔、成交明細、部位未實現/已實現損益、紅漲綠跌全域一致、響應式 + 重連）。缺口則高度集中在**圖表層**——而整個圖表層被**單一前置依賴**卡住：後端沒有 K 線資料、前端沒有專業圖表引擎。補上這對地基，A/B/C 三領域的大量需求會一次解鎖。

## 已達標（保留為基準）
- **QM-1 即時報價列**（逐筆閃色）、**QM-3 五檔**、**QM-4 成交明細 tape**（基礎）— `DetailPanel/OrderBook/TickTape.vue`
- **TP-3 部位 + 未實現/已實現損益**（即時、數學正確）— `utils/positions.ts`
- **CT-2 折線 + 面積圖** — `Sparkline.vue`
- **AR-3 紅漲綠跌全域一致**、**AR-4 WebSocket tick 管線**、**AR-5 響應式 + 重連**

## 關鍵缺口（依槓桿排序）

1. **AR-2 後端 K 線聚合（P0，最關鍵前置）** — 後端只存滾動收盤價 `number[]`，無 OHLC、無分鐘/日/週/月 bucket。沒有它，K 線、量能副圖、週期切換、技術指標全部無資料可餵。
2. **AR-1 專業圖表引擎（P0，第二前置）** — 主圖是手繪靜態 SVG sparkline，無法承載蠟燭/影線、十字線、縮放平移、指標、繪圖。**CT-*/IX-*/IN-* 幾乎全部依賴它。**
3. **C 技術指標全缺（P0/P1）** — MA/EMA/量副圖/MACD/RSI/KD 0 實作。
4. **E 下單深度（P0/P1）** — 缺訂單種類（市價/限價/停損）、張/股單位、手續費+證交稅+購買力檢查、送單確認框。
5. **D 盤面細節（P0/P1）** — QM-2 缺 52週高低/均量/市值；QM-4 缺主動方（內外盤）；QM-6 缺漲跌停鎖死狀態；無警示系統。

## 函式庫決策（AR-1）— 含 D3.js 權衡

團隊 open to d3.js。三方案：

| 方案 | 優點 | 缺點 | 命中需求 |
|------|------|------|---------|
| **(a) KLineChart** (Apache-2.0) | 金融專用，內建 K線/量/MA/EMA/MACD/RSI/BOLL、十字線、縮放平移、繪圖、多 pane | 客製受其資料模型限制；主題需用 styles API 對映 token | CT-1~5、IX-1~7、IN-1~4 一次大量打勾 |
| **(b) d3.js** | 低階、依賴極輕、最大客製、完美貼合現有深色主題 | 蠟燭/座標軸/十字線/縮放/指標全自研，工程量巨大（重造輪子） | 每項都要自刻 |
| **(c) Lightweight-Charts** (Apache-2.0) | 輕量高效，內建 candlestick/line/area/histogram/baseline + 十字線縮放 | 指標需自算、繪圖/多 pane 偏弱、客製封閉 | CT-1~3、IX-2~3 |

**建議：主圖採 (a) KLineChart**（符合 reuse-first，一庫覆蓋 A/B/C/F 多條 P0+P1，主題以 token 注入融入現有 dark theme）。**D3.js 留給「KLineChart 做不到的 bespoke 視覺化」**——正是「有需要的話引入 d3」的最佳位置：**CT-8 Volume Profile、QM-10 Heatmap（d3-hierarchy treemap）、CT-7 自繪深度圖**。不一開始全押 d3。

## 優先級路線圖

### Phase 1 — 圖表引擎地基（P0，最高槓桿）
- **AR-2**：後端新增 `Candle{time,open,high,low,close,volume}`；`TwseFeed.ingest` 把 tick 聚合成 1m bar 並 roll-up 5m/15m；日/週/月由 TWSE 歷史日 K（`exchangeReport/STOCK_DAY`）回填；`GET /api/klines/:symbol?interval=` 端點。（L）
- **AR-1**：以 client-only `<KlineChart>` 元件整合 KLineChart，餵 AR-2 的 OHLC，主題對映 `theme.css` token。（M）
- **一次解鎖**：CT-1 蠟燭、CT-3 量能 histogram、IX-1 週期切換、IX-2 縮放平移、IX-3 十字線 tooltip、IX-5 軸模式。

### Phase 2 — 技術指標與圖表型態（P0/P1）
- IN-1 MA/EMA、IN-2 量副圖、IN-3 MACD/RSI/KD、IN-4 BOLL/VWAP（KLineChart `createIndicator`）。
- CT-4 空心K/Heikin-Ashi、CT-5 OHLC bar、IX-6 多 pane、IX-7 趨勢線/水平線、IN-5 指標選單 + 可調參數。

### Phase 3 — 下單深化與盤面補強（P0/P1）
- TP-4 訂單種類、TP-2 張/股、TP-1 方向 toggle、TP-6 手續費+證交稅+購買力、TP-7 送單確認框、TP-5 TIF。
- QM-2 52週/均量/市值、QM-4 主動方上色、QM-6 漲跌停鎖死、QM-5 watchlist 分組/欄位模式、QM-7 到價警示 + 瀏覽器推播、CT-6 baseline 雙色。

### Phase 4 — 進階（P2，D3.js 出場）
- CT-7 深度圖、**CT-8 Volume Profile（d3）**、**QM-10 Heatmap treemap（d3-hierarchy）**、QM-9 Screener、IX-8~10（多圖 grid/save-load、Fibonacci/多空持倉/Anchored VWAP、比較疊加 + Bar Replay）、TP-8 括號單/OCO、TP-9 DOM 點價/拖曳/熱鍵、QM-8 Level-2、QM-11 指數/新聞、QM-12 盤前盤後。

## 建議下一步
從 **Phase 1** 開始（AR-2 → AR-1）。這是唯一同時打開 A/B/C 三領域的關鍵路徑，完成後交易台會從「展示型」躍升至接近 moomoo/富邦行動看盤的專業度。
