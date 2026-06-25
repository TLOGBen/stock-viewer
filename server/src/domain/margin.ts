/**
 * Pure parsing for TWSE opendata 融資融券 (MI_MARGN). Object row with named
 * keys. No I/O.
 *
 * Unit note (C5): MI_MARGN balances are already in 張 (NOT 股) — do NOT divide
 * by 1000. 1513 reference: 融資今日餘額 10160 張, 融券今日餘額 89 張.
 */
import { num } from "./officialClose.js";

/** One day's margin/short balances for a single stock, in 張. */
export interface MarginData {
  /** 融資今日餘額, 張. */
  marginBalance: number | null;
  /** 融券今日餘額, 張. */
  shortBalance: number | null;
  /** 券資比 % = 融券餘額 / 融資餘額 × 100; null when 融資餘額 is 0/absent. */
  shortMarginRatioPct: number | null;
}

/** Parse one MI_MARGN row. */
export function parseMarginRow(row: Record<string, unknown>): MarginData {
  const marginBalance = num(row["融資今日餘額"]);
  const shortBalance = num(row["融券今日餘額"]);
  const shortMarginRatioPct =
    marginBalance != null && marginBalance !== 0 && shortBalance != null
      ? (shortBalance / marginBalance) * 100
      : null;
  return { marginBalance, shortBalance, shortMarginRatioPct };
}
