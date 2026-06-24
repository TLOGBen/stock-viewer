/**
 * Per-symbol summary statistics (QM-2): 52-week high/low, 20-day average
 * volume, last-day amplitude, market cap (unavailable → null). Pure — the I/O
 * wrapper (`computeStats`) lives in the usecase layer.
 */
import type { Candle, SymbolStats } from "./types.js";

/** ~one trading year of sessions — the 52-week look-back window. */
const TRADING_YEAR = 252;

/** Look-back window for the average-volume figure. */
const AVG_VOLUME_DAYS = 20;

/** All-null stats for a symbol with no usable candle history. */
export function emptyStats(symbol: string): SymbolStats {
  return {
    symbol,
    week52High: null,
    week52Low: null,
    avgVolume20: null,
    marketCap: null,
    amplitude: null,
  };
}

/**
 * Compute summary stats from an ascending daily candle series. Pure.
 *
 *   week52High  = max high over the last ~252 sessions
 *   week52Low   = min low  over the last ~252 sessions
 *   avgVolume20 = mean volume (張) of the last 20 sessions
 *   amplitude   = last day (high-low)/prevDayClose * 100 (null if not derivable)
 *   marketCap   = null — no shares-outstanding source; never faked
 *
 * Empty input → all-null stats.
 */
export function statsFromDaily(
  symbol: string,
  daily: readonly Candle[],
): SymbolStats {
  if (daily.length === 0) return emptyStats(symbol);

  // 52-week window: the trailing TRADING_YEAR sessions.
  const window = daily.slice(Math.max(0, daily.length - TRADING_YEAR));
  const first = window[0]!;
  let week52High = first.high;
  let week52Low = first.low;
  for (const c of window) {
    if (c.high > week52High) week52High = c.high;
    if (c.low < week52Low) week52Low = c.low;
  }

  // 20-day average volume over the trailing AVG_VOLUME_DAYS sessions.
  const volWindow = daily.slice(Math.max(0, daily.length - AVG_VOLUME_DAYS));
  let volSum = 0;
  for (const c of volWindow) volSum += c.volume;
  const avgVolume20 = volWindow.length > 0 ? volSum / volWindow.length : null;

  // Amplitude: last day's range vs the prior day's close.
  const last = daily[daily.length - 1]!;
  let amplitude: number | null = null;
  if (daily.length >= 2) {
    const prev = daily[daily.length - 2]!;
    if (prev.close !== 0) {
      amplitude = ((last.high - last.low) / prev.close) * 100;
    }
  }

  return {
    symbol,
    week52High,
    week52Low,
    avgVolume20,
    marketCap: null,
    amplitude,
  };
}
