/**
 * Maps our design tokens (theme.css) to a KLineChart `Styles` object.
 *
 * Pure: returns a plain partial-styles object with no side effects. The hex
 * literals are read straight from `web/assets/css/theme.css` (KLineChart paints
 * on a <canvas>, so CSS custom properties can't be resolved by the lib — we
 * inline the resolved values here, keeping a single source of truth in comments).
 *
 * 紅漲綠跌 (Taiwan convention): up = RED (--up #ff4d57), down = GREEN (--down #1fd18c).
 */

// ── resolved design tokens (from theme.css — 機構交易終端 palette) ──
const UP = "#ff4d5e"; // --up   (漲 red)
const DOWN = "#19d18a"; // --down (跌 green)
const FLAT = "#828c9c"; // --flat (no change)
const GRID = "#11141c"; // --grid-line
const BORDER = "#1a1f2b"; // --border (hairline)
const TEXT_2 = "#9aa6b7"; // --text-2
const TEXT_3 = "#828c9c"; // --text-3 (axis tick text)
const SURFACE = "#0a0c11"; // --surface (tooltip/mark text bg)
const UP_LINE = "rgba(255, 77, 94, 0.6)"; // --up-line (area line)
const UP_SOFT = "rgba(255, 77, 94, 0.15)"; // --up-soft (area fill)

const MONO =
  '"JetBrains Mono", "SF Mono", ui-monospace, "Roboto Mono", Menlo, Consolas, monospace';

/**
 * The KLineChart styles object for our dark, 紅漲綠跌 theme. Typed loosely as a
 * deep-partial-ish record so we avoid importing the lib's `DeepPartial<Styles>`
 * into a pure util (the component passes this to `init`/`setStyles`).
 */
export function themeToKlineStyles(): Record<string, unknown> {
  return {
    grid: {
      show: true,
      horizontal: { show: true, color: GRID, size: 1 },
      vertical: { show: true, color: GRID, size: 1 },
    },
    candle: {
      // up/down/no-change for solid + stroke candle bodies + wicks + borders
      bar: {
        upColor: UP,
        downColor: DOWN,
        noChangeColor: FLAT,
        upBorderColor: UP,
        downBorderColor: DOWN,
        noChangeBorderColor: FLAT,
        upWickColor: UP,
        downWickColor: DOWN,
        noChangeWickColor: FLAT,
      },
      // area / line mode line + gradient fill (line mode hides the fill itself)
      area: {
        lineSize: 2,
        lineColor: UP_LINE,
        value: "close",
        smooth: false,
        backgroundColor: [
          { offset: 0, color: UP_SOFT },
          { offset: 1, color: "rgba(255, 77, 94, 0.02)" },
        ],
        point: { show: false },
      },
      priceMark: {
        show: true,
        high: { show: true, color: TEXT_2, textFamily: MONO },
        low: { show: true, color: TEXT_2, textFamily: MONO },
        last: {
          show: true,
          // compare-rule colouring vs previous close
          upColor: UP,
          downColor: DOWN,
          noChangeColor: FLAT,
          line: { show: true, size: 1 },
          text: {
            show: true,
            size: 11,
            family: MONO,
            color: "#ffffff",
            borderColor: "transparent",
          },
        },
      },
      tooltip: {
        showRule: "follow_cross",
        showType: "standard",
        text: { size: 12, family: MONO, color: TEXT_2 },
      },
    },
    indicator: {
      // sub-pane indicator bars (e.g. VOL/MACD histograms) follow 紅漲綠跌
      ohlc: { upColor: UP, downColor: DOWN, noChangeColor: FLAT },
      bars: [
        {
          style: "fill",
          upColor: UP_SOFT,
          downColor: "rgba(25, 209, 138, 0.15)",
          noChangeColor: "rgba(130, 140, 156, 0.13)",
        },
      ],
      tooltip: {
        showRule: "always",
        showType: "standard",
        text: { size: 11, family: MONO, color: TEXT_2 },
      },
    },
    xAxis: {
      axisLine: { show: true, color: BORDER, size: 1 },
      tickLine: { show: true, color: BORDER, size: 1, length: 3 },
      tickText: { color: TEXT_3, size: 11, family: MONO },
    },
    yAxis: {
      axisLine: { show: true, color: BORDER, size: 1 },
      tickLine: { show: true, color: BORDER, size: 1, length: 3 },
      tickText: { color: TEXT_3, size: 11, family: MONO },
    },
    separator: {
      size: 1,
      color: BORDER,
      fill: true,
      activeBackgroundColor: "rgba(170, 180, 196, 0.08)",
    },
    crosshair: {
      show: true,
      horizontal: {
        show: true,
        line: { show: true, style: "dashed", color: TEXT_3, size: 1 },
        text: {
          show: true,
          color: "#ffffff",
          size: 11,
          family: MONO,
          backgroundColor: SURFACE,
          borderColor: BORDER,
        },
      },
      vertical: {
        show: true,
        line: { show: true, style: "dashed", color: TEXT_3, size: 1 },
        text: {
          show: true,
          color: "#ffffff",
          size: 11,
          family: MONO,
          backgroundColor: SURFACE,
          borderColor: BORDER,
        },
      },
    },
  };
}
