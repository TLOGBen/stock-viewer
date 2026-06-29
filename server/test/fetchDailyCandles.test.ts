import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { HistoryClient } from "../src/adapters/index.js";
import { fetchDailyCandles } from "../src/usecase/fetchHistory.js";

/** One TWSE STOCK_DAY row (close at index 6, volume in 股). */
function twseRow(date: string, close: string, shares: string): unknown[] {
  return [date, shares, "0", close, close, close, close, "0", "0", ""];
}

/** One TPEx tradingStock row (close at index 6, volume in 仟股 == 張). */
function tpexRow(date: string, close: string, lots: string): unknown[] {
  return [date, lots, "0", close, close, close, close, "0", "0"];
}

describe("fetchDailyCandles — exchange routing", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("tse: calls STOCK_DAY (fetchMonthRaw) and converts 股 → 張", async () => {
    const fetchMonthRaw = vi.fn(async () => ({
      stat: "OK",
      data: [twseRow("115/06/03", "100.00", "45,207,883")],
    }));
    const client: HistoryClient = {
      fetchMonthRaw,
      fetchTpexMonthRaw: vi.fn(async () => ({ tables: [] })),
    };

    const candles = await fetchDailyCandles("2330", "tse", 1, client);

    expect(client.fetchTpexMonthRaw).not.toHaveBeenCalled();
    expect(fetchMonthRaw).toHaveBeenCalledOnce();
    expect(candles).toHaveLength(1);
    expect(candles[0]!.close).toBe(100);
    expect(candles[0]!.volume).toBe(Math.round(45207883 / 1000)); // 45208
  });

  it("otc: calls TPEx (fetchTpexMonthRaw) and keeps 仟股 as 張", async () => {
    const fetchTpexMonthRaw = vi.fn(async () => ({
      tables: [{ data: [tpexRow("115/06/01", "2,770.00", "8,836")] }],
    }));
    const client: HistoryClient = {
      fetchMonthRaw: vi.fn(async () => ({ stat: "OK", data: [] })),
      fetchTpexMonthRaw,
    };

    const candles = await fetchDailyCandles("8299", "otc", 1, client);

    expect(client.fetchMonthRaw).not.toHaveBeenCalled();
    expect(fetchTpexMonthRaw).toHaveBeenCalledOnce();
    expect(candles).toHaveLength(1);
    expect(candles[0]!.close).toBe(2770);
    expect(candles[0]!.volume).toBe(8836); // no /1000
  });

  it("otc: a TPEx month that throws is skipped, not fatal; others survive", async () => {
    // monthsBack=2 → two month queries; the first (i=0) throws, the second
    // (older month) returns a row. The merged result keeps the surviving row.
    let call = 0;
    const fetchTpexMonthRaw = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error("TPEx 500");
      return { tables: [{ data: [tpexRow("115/05/02", "2,500.00", "1,000")] }] };
    });
    const client: HistoryClient = {
      fetchMonthRaw: vi.fn(),
      fetchTpexMonthRaw,
    };

    const candles = await fetchDailyCandles("8299", "otc", 2, client);

    expect(fetchTpexMonthRaw).toHaveBeenCalledTimes(2);
    expect(candles).toHaveLength(1);
    expect(candles[0]!.close).toBe(2500);
  });
});
