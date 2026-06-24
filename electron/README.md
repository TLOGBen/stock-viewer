# 桌面版（Electron）打包說明

把這個專案包成 Windows 桌面 App（`.exe` 安裝檔），給不會開網站的人雙擊即用。
後端（Node + WebSocket）與前端（Nuxt SPA）會一起塞進 App，由 App 自己在
背景把後端跑起來，視窗載入 `http://127.0.0.1:4000`。

## 推薦：用 GitHub Actions 出 release（免本機 wine）

最省事、也不依賴任何個人環境。推一個版本 tag，CI 會在 `windows-latest` 上
原生打包並發佈到 GitHub Releases；App 的自動更新就是讀這裡的檔案。

```bash
# 改好 package.json 的 version 後：
git tag v1.0.1
git push origin v1.0.1
```

流程定義在 [`.github/workflows/release.yml`](../.github/workflows/release.yml)：
checkout → 安裝三層依賴（root / server / web）→ `npm run release:win`
（內含 `electron-builder --publish always`，用內建的 `GITHUB_TOKEN` 建立 Release）。
也可以到 GitHub 的 **Actions** 分頁手動觸發（workflow_dispatch）。

> owner / repo 不寫死在程式裡——CI 會用 `GITHUB_REPOSITORY` 自動帶入，
> 所以換成任何 fork 都能直接用。

## 本機打包（選用）

需要 Node 20+。產生 Windows 安裝檔時：

- **在 Windows 上 build** → 原生，免 wine。
- **在 Linux / WSL 上 build** → 需要 64-bit `wine` + 32-bit `wine32`，
  且 wine prefix 要含 32-bit 子系統（`wineboot -u`）。

```bash
npm install          # 安裝桌面層依賴（只需一次）
npm run dist:win     # 打包成 Windows 安裝檔（不發佈）
```

`dist:win` 會依序：
1. `build:server` — esbuild 把後端打成單一 CJS 檔（`server/bundle/index.cjs`，無需 node_modules）
2. `build:web` — `ELECTRON_BUILD=1 nuxt generate` 產生純靜態 SPA（`web/.output/public`）
3. `electron-builder --win` — 組成 NSIS 安裝檔

## 產出位置

本機打包輸出到專案內的 **`dist-electron/`**（相對路徑，已被 git 忽略）。
裡面的 `即時交易台 Setup <version>.exe` 就是要給人安裝的檔案。
用 GitHub Actions 時，產物則直接出現在對應的 GitHub Release 頁面。

## 安裝 / 解除安裝 / 更新

- **安裝**：雙擊 `Setup .exe`，可選安裝路徑，會建立桌面與開始選單捷徑。
- **解除安裝**：開始選單 → 即時交易台 → Uninstall，或 Windows「新增/移除程式」。
  解除安裝時會一併清掉 `%APPDATA%\即時交易台`（行情快取 / 自選股）。
  → 見 [`electron/build/installer.nsh`](build/installer.nsh)。
- **自動更新**：App 啟動時會檢查 GitHub Releases，有新版就背景下載，
  下載完跳出「立即重啟更新 / 稍後」。發佈新版只要推一個新 tag（見上）。

## 注意

- App 仍**需要連網**：即時報價來自台灣證交所（TWSE）線上 API。
- 後端固定用本機 `127.0.0.1:4000`，不對外開放。
- 自選股 / 快取存在 `%APPDATA%\即時交易台\data`，不會寫進安裝目錄。
- 目前用預設 Electron 圖示；放一個 `electron/build/icon.ico`（256×256）即可換成自訂圖示。
