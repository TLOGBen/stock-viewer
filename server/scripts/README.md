# server/scripts — 建置期維運工具（不屬六層 runtime）

這些腳本只在**建置期 / 維運**用 `tsx` 執行，**不被 `server/src` runtime import**。

## backfill-history.ts — PE/PB 與月營收歷史回填

從 [FinMind](https://finmind.github.io/) 一次補滿指定股票的 per-symbol 歷史，寫進
runtime 讀取的同一份快取（`valuation-series/{symbol}.json`、`revenue/{symbol}.json`），
讓個股頁河流圖／月營收表載入即顯示多年歷史，不再等 runtime 逐日累積。

### 前置：FinMind token（必要）

腳本需要 FinMind API token，從**環境變數 `FINMIND_TOKEN`** 讀取。未設定會以明確訊息中止
（非零退出），不會發出任何請求。token 屬機密，**勿硬編、勿進版控**。

至 <https://finmindtrade.com/> 註冊取得 token 後：

```bash
export FINMIND_TOKEN="<你的 token>"        # bash/zsh
# 或單次執行：FINMIND_TOKEN=<token> npx tsx ...
```

### 用法

```bash
# 從 repo 根目錄
FINMIND_TOKEN=<token> npx tsx server/scripts/backfill-history.ts 2330 1513
```

- 參數為一個或多個股票代碼（空白分隔）。
- 對每檔抓 TaiwanStockPER（日 PE/PB/殖利率）與 TaiwanStockMonthRevenue（月營收），
  正規化成 domain 型別後寫入對應 per-symbol 快取。
- **冪等**：重跑同一檔不會產生重複期數、已存在期數值不變。
- **resumable**：節流中斷後再跑會補齊，最終衍生值（mom/yoy/accYoy）與一次乾淨跑一致
  （衍生值在完整序列組好後一次計算）。
- **batch 韌性**：單一股票或單一資料集抓取失敗會記錄並略過，不中斷整批。

### 首次線上跑的校準（建議）

FinMind 的 `revenue` 單位假設為「元」，mapper 以 `/1000` 轉成 domain 的「千元」
（已對齊 1513 2026-05 = 23.92 億）。首次實跑時，建議先以 2330/1513 已知月份核對
寫入值與官方公布值；若 FinMind 單位/欄位與假設不符，調整 `server/scripts/finmindMapper.ts`
單一轉換點即可。
