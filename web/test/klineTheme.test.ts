import { describe, it, expect } from "vitest";
import { themeToKlineStyles } from "../utils/klineTheme";

/**
 * Taiwan market convention (from web/assets/css/theme.css — 機構交易終端 palette):
 *   漲 = RED   → --up:   #ff4d5e
 *   跌 = GREEN → --down: #19d18a
 *
 * themeToKlineStyles() must map these tokens onto the klinecharts candle bar
 * up/down colors, and must return a plain serializable object (no functions,
 * no class instances) so it can be handed straight to chart.setStyles().
 */
const UP_RED = "#ff4d5e";
const DOWN_GREEN = "#19d18a";

/** Narrow the loosely-typed styles object to the candle bar colors under test. */
function barColors(styles: Record<string, unknown>): {
  upColor: string;
  downColor: string;
} {
  const candle = styles.candle as { bar: { upColor: string; downColor: string } };
  return candle.bar;
}

describe("themeToKlineStyles", () => {
  it("colors the up candle bar with the --up red hex", () => {
    expect(barColors(themeToKlineStyles()).upColor.toLowerCase()).toBe(UP_RED);
  });

  it("colors the down candle bar with the --down green hex", () => {
    expect(barColors(themeToKlineStyles()).downColor.toLowerCase()).toBe(
      DOWN_GREEN,
    );
  });

  it("keeps up and down colors distinct", () => {
    const bar = barColors(themeToKlineStyles());
    expect(bar.upColor.toLowerCase()).not.toBe(bar.downColor.toLowerCase());
  });

  it("returns a plain, JSON-serializable object", () => {
    const styles = themeToKlineStyles();
    expect(styles).toBeTypeOf("object");
    expect(styles).not.toBeNull();
    // A round-trip through JSON must preserve the object exactly — proving it
    // holds no functions, undefined, symbols, or class instances.
    const roundTripped = JSON.parse(JSON.stringify(styles));
    expect(roundTripped).toEqual(styles);
  });

  it("is a pure function — repeated calls are deep-equal", () => {
    expect(themeToKlineStyles()).toEqual(themeToKlineStyles());
  });
});
