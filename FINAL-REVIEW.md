# 最終 /review — 全 Phase 建置後的符合度與正確性審查

> 管線最後一站（/think → /review → /analyze → /execute → **/review**）。
> 方法：符合度 re-scorecard + 4 維對抗式正確性審查，每個 finding 由獨立 agent 複核。
> 日期：2026-06-23。基準：[STANDARD-SPEC.md](./STANDARD-SPEC.md)。

## 符合度躍進

| 領域 | ✓ 已實作 | ◐ 部分 | ✗ 缺 | 主要缺口 |
|------|:---:|:---:|:---:|------|
| A. 圖表類型 (CT) | 7 | 0 | 2 | CT-6 baseline、CT-9 Renko/P&F/Kagi |
| B. 圖表互動 (IX) | 4 | 2 | 4 | IX-7~10 繪圖工具/多圖/比較回放 |
| C. 技術指標 (IN) | 3 | 2 | 2 | IN-5 參數編輯 UI、IN-7 指標告警 |
| D. 報價盤面 (QM) | 5 | 3 | 5 | QM-7 警示、QM-8/9/11/12 |
| E. 下單部位 (TP) | 7 | 0 | 2 | TP-8 括號單、TP-9 DOM/熱鍵 |
| F. 架構函式庫 (AR) | 6 | 0 | 0 | — 全數完成 |
| G. 平台品質 (PQ) | 4 | 3 | 1 | PQ-7 /stock 路由 |
| **合計** | **36** | **10** | **16** | of 62 |

**起點 ✓7 → 終點 ✓36。P0（26 條）：22 完成、4 部分、0 缺。** 174 單元測試通過（後端 88 + 前端 86），兩端 build 乾淨。

**4 個 P0 部分項**（皆有合理邊界，非缺陷）：QM-2 市值 null（無在外流通股數來源，誠實不造假）、QM-4 無主動方（MIS 不提供）、QM-5 無分組/欄位模式（計畫明確延後）、PQ-1 顯示位數固定（決策 6 刻意保留以免回歸）。

## 正確性審查：12 confirmed（1 HIGH / 2 MEDIUM / 9 LOW，0 CRITICAL）

### 已修復
| 嚴重 | ID | 問題 | 修法 |
|---|---|---|---|
| **HIGH** | ORD-1 | `applyOrder` 忽略 `OrderRequest.unit`，零股(股)單被當成 1000 倍張數，部位與現金失準 | `positions.ts`：下單量先正規化為 canonical 張（股÷1000）；加單元測試鎖定 |
| MEDIUM | DL-3 | 自選股 GET 把不在 universe 的代號靜默丟棄 | `restApi.ts`：每個持久化代號都回傳一列（未知者用 fallback row） |
| MEDIUM | VIZ-1 | 熱力圖標籤在飽和色塊上對比不足 | `Heatmap.vue`：標籤改純白 + 加強深色描邊 halo（WCAG） |
| LOW | ORD-2 | 純停損單以現價估算/成交，非觸發價 | `OrderTicket.vue`：stop 型以 stopPrice 估算 |
| LOW | ORD-3 | `OrderTicket.vue` 未使用的 import | 移除 |

### 已知限制（LOW，單人 demo 可接受；複核員多評為「今日正確性無需更動」）
- **DL-2** 無成交 re-poll 仍重發 candle 事件（WS 量略增，非錯誤）。
- **DL-4** 並發 watchlist PUT 的 read-modify-write race（單人不會觸發）。
- **DL-5** 搜尋為 O(N) 全掃（~11,400 列 <1ms，前端已 debounce）。
- **DL-6** 空 universe fallback 把 asOf 蓋成 now（stale 旗標仍正確）。
- **KL-2** 無成交 tick 以 quote 回退價注入合成 OHLC（盤中 bar 近似；快照價鏈刻意保留）。
- **KL-3** candleStore 不跨日重置（多日 uptime 才相關）。
- **VIZ-3** 過小色塊僅以顏色表方向（圖例已有 ▲漲/▼跌 文字）。

## 結論

從原本「展示型 demo（✓7）」升級為「**接近主流看盤台的可信交易台（✓36，全 P0 完成或部分，零 P0 缺）**」：全市場搜尋、動態自選股、真 K 線圖（多週期/多型態/技術指標）、含費用與風控的下單匣、資料鮮度/無障礙品質層、D3 深度/量價/熱力圖。唯一確認的 HIGH 缺陷（零股單位）已修復並加測試；其餘為 demo 可接受的 LOW 邊界。
