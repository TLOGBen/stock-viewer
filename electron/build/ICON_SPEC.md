# App Icon 需求規格（給 codex 產圖用）

桌面 App「即時交易台 / Taiwan Trading Desk」的應用程式圖示。
請把產出的檔案直接放到本資料夾 **`electron/build/`**，electron-builder 會自動使用。

## 要產的檔案

| 檔名 | 規格 | 用途 |
|---|---|---|
| `icon.png` | **1024×1024**, 32-bit PNG（含 alpha） | 主檔。macOS `.icns` 與 Linux 各尺寸由它自動衍生 |
| `icon.ico` | Windows multi-res ICO，內含 **256 / 128 / 64 / 48 / 32 / 16** px | Windows 安裝檔與捷徑圖示 |
| `icon.icns`（選配） | macOS icns（若 codex 能輸出；不能就只給 png 也行） | macOS App 圖示 |

> 三平台用同一張圖即可。最重要是 `icon.png`（1024）與 `icon.ico`。

## 視覺方向

- **主題**：深色機構級交易終端（dark institutional trading terminal），俐落、幾何、銳利邊緣，**不要**光澤/擬真/重陰影/漸層過度。
- **主視覺建議**：K 線（蠟燭）為母題——例如一紅一綠兩根蠟燭，或一根粗蠟燭搭一條向上的價格折線。簡潔、置中、可在 16px 仍可辨識。
- **不要放文字/字母**（16px 會糊）。

## 配色（直接取自 App 主題，務必一致）

| 角色 | 色碼 |
|---|---|
| 背景（最深） | `#050608` |
| 背景（視窗用，可作底） | `#0b0e14` |
| 面板/次背景 | `#0a0c11` ~ `#141822` |
| **漲 / 紅**（台灣慣例 up=紅） | `#ff4d5e` |
| **跌 / 綠**（台灣慣例 down=綠） | `#19d18a` |
| 細格線/中性（選配） | `#1c2230` |

> 注意台灣慣例 **紅漲綠跌**，別畫成歐美的綠漲紅跌。

## 構圖規範

- **滿版深色背景**（不要透明底；`#050608`→`#0b0e14` 的細微徑向漸層可接受），母題置中。
- **安全區**：重要內容收在中央 ~80%，四周留 ~12–15% padding——因為 **macOS 會把圖示裁成圓角方形**，邊緣內容會被切。
- 16px 版本請簡化細節（蠟燭保留、折線可省），確保工作列縮圖仍清楚。

## 一句話 prompt（可直接餵圖像模型）

> A minimal, geometric app icon for a dark institutional stock trading terminal:
> two crisp candlestick bars — one red (#ff4d5e) rising, one green (#19d18a) —
> centered on a near-black background (#050608 to #0b0e14, subtle radial),
> sharp flat edges, no text, no gloss, generous padding, 1024×1024, macOS
> rounded-square safe area.

產好後告訴我，我接上 `package.json` 的各平台 `icon` 設定並重打包驗證。
