# Changelog

本專案的所有重要變更皆記錄於此。格式依循 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版本號採用 [語意化版本](https://semver.org/lang/zh-TW/)。

## [1.7.1] - 2026-06-29

### Fixed
- 上櫃日K 自癒：歷史快取不再把「空日K結果」當成新鮮快取存放／服務 6 小時。空快取視為過期、下次瀏覽即重抓，且永不寫入空結果（杜絕快取下毒）。修正 8299 等上櫃股在更新到含 TPEx 支援的版本後，仍因舊空快取顯示「無日K資料（上櫃）」的問題。

## [1.7.0] - 2026-06-29

### Added
- 持倉落檔持久化：持倉與可用資金改存伺服器端 `{dataDir}/positions.json`，重整／關閉重開不再清空（新增 `GET`／`PUT /api/positions`，每次變更 debounced 落檔）。
- 持倉頁新增「重置模擬」按鈕：確認後清空所有持倉並還原初始可用資金。

## [1.6.0] - 2026-06-29

### Added
- 上櫃（TPEx）個股日K回填：接上櫃買中心「個股日成交」端點，依交易所（tse／otc）分流。8299 等上櫃股不再無日K資料。

### Fixed
- `fetchDailyCandles` 先前對非上市（`exch !== "tse"`）直接回空陣列，導致所有上櫃股缺日K。

## [1.5.0] - 2026-06-29

### Added
- 持倉頁「可用資金」改為可點擊內嵌編輯，方便自訂模擬本金（what-if 模擬）。輸入支援 Enter／失焦提交、Esc 取消；其餘摘要欄位維持唯讀。
- `usePositions` 新增 `setCashBalance()`，含輸入驗證（忽略非有限數與負數）。

## [1.4.0] - 2026-06-26

### Added
- electron/web bridge 層 + 設定頁（最小化到系統匣）。

## [1.3.0] - 2026-06-25

### Added
- 個股頁 PE/PB 與月營收歷史回填子系統（FinMind seed + 官方續抽）。

## [1.2.0] - 2026-06-25

### Added
- 個股頁 winvest 式「一句話看懂」逐面向敘事 + 四燈號詳細數據明細。

## [1.1.1] - 2026-06-25

### Fixed
- 個股頁四燈號 scores 顯示前 round；單期月營收正確顯示。

## [1.1.0] - 2026-06-25

### Added
- 移植 winvest.tw 個股頁 research blocks 至個股詳細頁。

### Changed
- 後端完成六層分層（action/usecase/domain/persistence/adapters/middleware），移除過渡 shim。
- CI 改為 macOS／Linux／Windows 三平台 matrix 建置並自動發佈 release draft。

## [1.0.0] - 2026-06-24

### Added
- 台股即時交易台首版（Nuxt 3 前端 + Node/ws 後端）。
- 以 Electron 打包為 Windows 桌面應用，含 CI release 流程。

[1.7.1]: https://github.com/TLOGBen/stock-viewer/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/TLOGBen/stock-viewer/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/TLOGBen/stock-viewer/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/TLOGBen/stock-viewer/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/TLOGBen/stock-viewer/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/TLOGBen/stock-viewer/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/TLOGBen/stock-viewer/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/TLOGBen/stock-viewer/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/TLOGBen/stock-viewer/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/TLOGBen/stock-viewer/releases/tag/v1.0.0
