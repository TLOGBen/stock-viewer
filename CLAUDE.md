# CLAUDE.md — 台股即時交易台（Taiwan real-time trading desk）

供未來 session 遵循的架構與不變式說明。後端 `server/` 採標準六層分層架構，前端 `web/`（Nuxt 3 SPA）、桌面殼層 `electron/`。本文件與 `.claude/analyze/2026-06-24-backend-layered-refactor/design.md` 對齊；兩者衝突時以實際目錄與本文件為準，並回頭修正 design。

---

## 專案結構與常用指令

三個獨立 package（非 workspace，各自 `npm install`）：

| 目錄 | 角色 | 技術 |
|---|---|---|
| `server/` | 行情後端：輪詢 MIS 即時報價、官方收盤備援、WS 廣播、REST | Node + Express + ws + TS |
| `web/` | 前端交易台 UI（看盤/個股/持倉/市場/health） | Nuxt 3（Vue 3 + TS）|
| `electron/` | 桌面殼層：背景啟動後端、載入打包 SPA、自動更新 | Electron + electron-builder |

常用指令：

```bash
# 開發（兩個終端）
npm --prefix server run dev      # 後端 :4000
npm --prefix web run dev         # 前端 :3000

# 測試 / 型別（零回歸 gate）
npm --prefix server test         # vitest，目前 112
npm --prefix server run typecheck
npm --prefix web test            # vitest，目前 86
npm --prefix web run typecheck

# 桌面打包（根目錄）
npm run build:all                # esbuild 後端單檔 + nuxt generate SPA
npm run dist:win | dist:mac | dist:linux   # 本機打包
# 發版：改 package.json version → git tag vX.Y.Z → push tag → CI 三平台建置+發佈
```

詳細桌面打包/發版見 [`electron/README.md`](electron/README.md) 與 `.github/workflows/release.yml`。

---

## 後端六層架構（`server/src/`）

依賴方向**恆向內**：外層依賴內層，`domain/` 不依賴任何人。`index.ts` 是唯一的組裝點（composition root）。

```
action/        對外入口：HTTP 路由 + WS。只驗證輸入、呼叫 usecase、序列化結果。無業務邏輯。
  │
middleware/    對外 API 橫切：cors / json body / errorHandler / validateSymbol / spaStatic。
  │
usecase/       應用編排：組合 domain 純邏輯 + persistence + adapters。
  │
  ├──────────► domain/        純函式與型別，無任何 IO。可單測、無副作用。
  │
persistence/   持久化 repo（磁碟 / 記憶體）：watchlist / universe / history / official-close / candle。
  │            只依賴內向的 domain/。
  │
adapters/      對外 IO client：MIS 即時、TWSE OpenAPI、TWSE RWD 日K。封裝 fetch、處理逾時/錯誤。
               回傳 domain 型別（或 raw rows，解析留在 domain）。只依賴 domain/。

index.ts       composition root：建立 adapters→persistence→usecase→action 注入鏈，掛 middleware，啟動 HTTP+WS。
```

### 各層職責

| 層 | 目錄 | 職責 | 不可做 |
|---|---|---|---|
| **action** | `action/` | HTTP 路由（`httpApi.ts`，掛 `/api`，含 `/api/health`）、WS 連線（`wsServer.ts`，path `/ws`）。把請求轉給 usecase、把結果序列化上線 | 業務邏輯、直接讀寫磁碟、直接 fetch |
| **middleware** | `middleware/` | cors / json / 統一 errorHandler / symbol 驗證 / packaged 模式 SPA 靜態服務 + history fallback（`WEB_DIST`） | 業務決策 |
| **usecase** | `usecase/` | feed 輪詢（`quoteFeed.ts`）、kline、search、watchlist、health、marketStats、universeService。注入 adapters/persistence | 自行 `new` adapter（必須注入）、直接框架依賴 |
| **domain** | `domain/` | 型別（Quote/Market/Health/Instrument/Candle/Message…）+ 純函式（parseMisItem/parseLevels/computeMarketStatus/tickSize/marketStats/validation/parseStockDayAllRow） | **任何 IO**：`express`/`ws`/`fetch`/`node:fs` |
| **persistence** | `persistence/` | repo 介面 + 實作（磁碟/記憶體）：watchlistStore / universeCache / historyCache / officialCloseCache（1 天 TTL）/ candleStore | 對外 HTTP、業務編排 |
| **adapters** | `adapters/` | 把外部 HTTP 來源封裝成 client：misClient / officialClient / universeClient / historyClient。逾時/錯誤在此邊界處理 | 解析成富型別（留 domain）、持久化 |

每層都有 barrel `index.ts` 作為單一 import 介面（`./adapters/index.js`、`./persistence/index.js`、`./usecase/index.js`、`./action/index.js`、`./middleware/index.js`、`./domain/index.js`）。

> 歷史相容 barrel：`twseFeed.ts` / `types.ts` / `validation.ts` 等舊路徑為 re-export shim，讓既有測試的 import 不必大改。**新程式不要 import 這些 shim**，請直接 import 對應的分層 barrel。

---

## 新程式該放哪一層（決策規則）

依序自問，第一個命中的就是落點：

1. **要打外部 HTTP / 讀外部 API？** → `adapters/`（包成 client，注入 `fetch`，邊界 try/catch）。
2. **要讀寫磁碟 / 記憶體快取 / repo？** → `persistence/`（find/save 介面，never throw）。
3. **是純計算 / 型別，無副作用？** → `domain/`（可單測、禁 IO）。
4. **是把上面三者組起來的應用流程（輪詢、聚合、編排）？** → `usecase/`（相依用注入，不自行 new）。
5. **是 HTTP 路由 / WS 入口？** → `action/`（只驗證 + 委派 + 序列化）。
6. **是對外 API 的橫切（cors/json/錯誤/驗證/靜態）？** → `middleware/`。
7. **是把以上接線、注入、啟動？** → `index.ts`（composition root，唯一組裝點）。

資料夾對照：`misClient`→adapters、`officialCloseCache`→persistence、`parseStockDayAllRow`→domain、`quoteFeed`/`getHealth`→usecase、`httpApi`/`wsServer`→action、`validateSymbol`/`errorHandler`→middleware。

---

## 關鍵不變式（最高優先，零回歸）

1. **對外契約不可變**：`/api/*` 路由路徑、回應 JSON 形狀、WS 訊息（`snapshot`/`quote`/`market`/`candle`）與重構前完全一致。既有測試即契約守門。
2. **domain 純淨**：`domain/` 不得 import `express` / `ws` / `fetch` / `node:fs`。
3. **快取/備援 never throw**：所有 persistence 快取與官方備援路徑不丟例外。讀失敗回 `null`/空、寫失敗 log 後不中斷；任一外部來源異常都不能讓 feed 或 API 崩潰。
4. **官方備援不覆寫**：官方收盤（`STOCK_DAY_ALL`）僅填「目前無任何快照」的標的，標 `source="official-close"`；**絕不覆寫即時或最後已知資料**（寫入前先檢查 snapshot 不存在）。
5. **即時用 MIS、官方僅每日收盤備援**：即時報價來源是 MIS；官方 OpenAPI 只作每日收盤備援，寫入磁碟快取 TTL = 1 天（原子寫入：tmp + rename）。「可能過期」由 health 的 `feed.officialCache.ageMs` 相對 TTL 表達，Quote 上不另設 stale 旗標。
6. **失敗門檻具名常數**：`FAILURE_THRESHOLD = 3`（`domain/`），單一定義、各處引用。MIS 連續失敗達此門檻才啟動官方備援。
7. **注入式相依**：usecase 不自行 `new` adapter/store，一律由 `index.ts` 注入，以便測試與替換。

### health 三態（`usecase/getHealth`）

| status | 條件 |
|---|---|
| `ok` | 有即時資料（近期成功 tick，`fallbackActive===false` 且有快照） |
| `degraded` | `fallbackActive===true`，或連續失敗 ≥ `FAILURE_THRESHOLD` 但仍有快照 |
| `down` | `lastTickAt===0` 且無任何快照、官方備援亦無資料可填 |

---

## 測試守門慣例

- 後端既有測試是「行為契約」守門員：重構時**只允許改 import 路徑、不改斷言**。
- **每完成一個遷移步驟就跑一次**，全綠才前進（零回歸）：
  - `npm --prefix server run typecheck`
  - `npm --prefix server test`（目標 ≥ 88 全綠；目前 112）
- 前端零回歸 gate：`npm --prefix web test`（86）+ `npm --prefix web run typecheck` 保持綠。
- domain 純淨可用 grep gate 驗證：`grep -rE "from \"express\"|from \"ws\"|fetch\(|node:fs" server/src/domain/` 應無命中。
- 整合測試以注入式 fake adapter/cache 驗證，不打真網路（見 `test/healthRoute.test.ts`、`test/quoteFeed.test.ts`、`test/officialCloseCache.test.ts`）。

---

## 範圍邊界

- 即時來源固定為 MIS（無免費官方即時 API）；官方 OpenAPI 僅每日收盤備援，本專案不新增第三方資料供應商。
- icon 接線與三平台打包屬 electron-builder 建置設定（`electron/build/icon.{png,ico,icns}` 已存在，packaging 只接線勿重產圖），**不在後端六層架構內**，見 `.github/workflows/release.yml` 與 task-packaging。
