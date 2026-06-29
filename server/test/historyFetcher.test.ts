import { describe, expect, it } from "vitest";

import type { Candle } from "../src/domain/index.js";
import {
  parseStockDayRow,
  parseStockDayResponse,
  parseTpexRow,
  parseTpexResponse,
  rocDateToEpoch,
  stripCommas,
} from "../src/domain/index.js";
import { rollupDaily } from "../src/persistence/historyCache.js";

describe("stripCommas", () => {
  it("removes every thousands separator", () => {
    expect(stripCommas("45,207,883")).toBe("45207883");
    expect(stripCommas("2,510.00")).toBe("2510.00");
  });

  it("leaves comma-free strings untouched", () => {
    expect(stripCommas("2510")).toBe("2510");
    expect(stripCommas("")).toBe("");
  });
});

describe("rocDateToEpoch", () => {
  it("maps a ROC date to the UTC midnight epoch of that day", () => {
    // 115 + 1911 = 2026 → 2026-06-22 UTC midnight.
    expect(rocDateToEpoch("115/06/22")).toBe(Date.UTC(2026, 5, 22));
  });

  it("handles the first of the month", () => {
    expect(rocDateToEpoch("115/06/01")).toBe(Date.UTC(2026, 5, 1));
  });

  it("returns NaN for malformed tokens", () => {
    expect(Number.isNaN(rocDateToEpoch("bad"))).toBe(true);
    expect(Number.isNaN(rocDateToEpoch("115/06"))).toBe(true);
  });
});

describe("parseStockDayRow", () => {
  // Real STOCK_DAY shape (the index row example from the spec).
  const sampleRow: readonly unknown[] = [
    "115/06/22",
    "45,207,883",
    "112,735,082,698",
    "2,455.00",
    "2,510.00",
    "2,455.00",
    "2,510.00",
    "+100.00",
    "159,770",
    "",
  ];

  it("maps the row to a Candle with the right close and 張 volume", () => {
    const candle = parseStockDayRow(sampleRow);
    expect(candle).not.toBeNull();
    expect(candle!.close).toBe(2510);
    expect(candle!.open).toBe(2455);
    expect(candle!.high).toBe(2510);
    expect(candle!.low).toBe(2455);
    // 股 → 張: round(45207883 / 1000) = 45208.
    expect(candle!.volume).toBe(Math.round(45207883 / 1000));
    expect(candle!.volume).toBe(45208);
    expect(candle!.timestamp).toBe(Date.UTC(2026, 5, 22));
  });

  it("returns null when the close cannot be parsed", () => {
    const noClose = [...sampleRow];
    noClose[6] = "--";
    expect(parseStockDayRow(noClose)).toBeNull();
  });

  it("returns null when the date is malformed", () => {
    const badDate = [...sampleRow];
    badDate[0] = "not-a-date";
    expect(parseStockDayRow(badDate)).toBeNull();
  });
});

describe("parseStockDayResponse", () => {
  const okResponse = {
    stat: "OK",
    fields: ["日期", "成交股數"],
    data: [
      [
        "115/06/22",
        "45,207,883",
        "112,735,082,698",
        "2,455.00",
        "2,510.00",
        "2,455.00",
        "2,510.00",
        "+100.00",
        "159,770",
        "",
      ],
      [
        "115/06/23",
        "30,000,000",
        "75,000,000,000",
        "2,510.00",
        "2,530.00",
        "2,500.00",
        "2,520.00",
        "+10.00",
        "100,000",
        "",
      ],
    ],
  };

  it("parses every data row when stat is OK", () => {
    const candles = parseStockDayResponse(okResponse);
    expect(candles).toHaveLength(2);
    expect(candles[0]!.close).toBe(2510);
    expect(candles[1]!.close).toBe(2520);
  });

  it("returns [] when stat is not OK", () => {
    expect(parseStockDayResponse({ stat: "很抱歉", data: [] })).toEqual([]);
  });

  it("returns [] when data is missing or not an array", () => {
    expect(parseStockDayResponse({ stat: "OK" })).toEqual([]);
    expect(parseStockDayResponse({ stat: "OK", data: "nope" })).toEqual([]);
    expect(parseStockDayResponse(null)).toEqual([]);
  });
});

describe("parseTpexRow", () => {
  // Real TPEx tradingStock shape (8299 群聯, 115/06/01). Columns:
  // [ROC date, 成交仟股, 成交仟元, 開, 高, 低, 收, 漲跌, 筆數].
  const sampleRow: readonly unknown[] = [
    "115/06/01",
    "8,836",
    "24,236,702",
    "2,655.00",
    "2,825.00",
    "2,625.00",
    "2,770.00",
    "195.00",
    "37,290",
  ];

  it("maps the row to a Candle, treating 仟股 as 張 directly (no /1000)", () => {
    const candle = parseTpexRow(sampleRow);
    expect(candle).not.toBeNull();
    expect(candle!.open).toBe(2655);
    expect(candle!.high).toBe(2825);
    expect(candle!.low).toBe(2625);
    expect(candle!.close).toBe(2770);
    // 成交仟股 == 張: 8,836 stays 8836, NOT divided by 1000.
    expect(candle!.volume).toBe(8836);
    expect(candle!.timestamp).toBe(Date.UTC(2026, 5, 1));
  });

  it("returns null when the close cannot be parsed", () => {
    const noClose = [...sampleRow];
    noClose[6] = "--";
    expect(parseTpexRow(noClose)).toBeNull();
  });

  it("returns null when the date is malformed", () => {
    const badDate = [...sampleRow];
    badDate[0] = "not-a-date";
    expect(parseTpexRow(badDate)).toBeNull();
  });
});

describe("parseTpexResponse", () => {
  const okResponse = {
    tables: [
      {
        title: "個股日成交資訊",
        data: [
          [
            "115/06/01",
            "8,836",
            "24,236,702",
            "2,655.00",
            "2,825.00",
            "2,625.00",
            "2,770.00",
            "195.00",
            "37,290",
          ],
          [
            "115/06/02",
            "10,010",
            "27,843,791",
            "2,810.00",
            "2,835.00",
            "2,690.00",
            "2,820.00",
            "50.00",
            "39,515",
          ],
        ],
      },
    ],
  };

  it("parses every data row under tables[0].data", () => {
    const candles = parseTpexResponse(okResponse);
    expect(candles).toHaveLength(2);
    expect(candles[0]!.close).toBe(2770);
    expect(candles[0]!.volume).toBe(8836);
    expect(candles[1]!.close).toBe(2820);
  });

  it("returns [] when tables is empty, missing, or data is not an array", () => {
    expect(parseTpexResponse({ tables: [] })).toEqual([]);
    expect(parseTpexResponse({ tables: [{ data: "nope" }] })).toEqual([]);
    expect(parseTpexResponse({})).toEqual([]);
    expect(parseTpexResponse(null)).toEqual([]);
  });
});

/** Build a daily candle quickly for roll-up tests. */
function daily(
  y: number,
  m: number,
  d: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): Candle {
  return {
    timestamp: Date.UTC(y, m - 1, d),
    open,
    high,
    low,
    close,
    volume,
  };
}

describe("rollupDaily — weekly (ISO Monday-based)", () => {
  // 2026-06-22 is a Monday; 23,24 same week. 2026-06-29 starts the next week.
  const series: Candle[] = [
    daily(2026, 6, 22, 100, 110, 95, 105, 10), // Mon
    daily(2026, 6, 23, 105, 120, 100, 115, 20), // Tue
    daily(2026, 6, 24, 115, 118, 108, 112, 30), // Wed
    daily(2026, 6, 29, 112, 130, 111, 128, 40), // next Mon
  ];

  it("groups Mon-Sun into one bar per week", () => {
    const weeks = rollupDaily(series, "W");
    expect(weeks).toHaveLength(2);

    const first = weeks[0]!;
    expect(first.timestamp).toBe(Date.UTC(2026, 5, 22)); // first day's ts
    expect(first.open).toBe(100); // first open
    expect(first.high).toBe(120); // max high across Mon-Wed
    expect(first.low).toBe(95); // min low
    expect(first.close).toBe(112); // last close
    expect(first.volume).toBe(60); // 10+20+30

    const second = weeks[1]!;
    expect(second.timestamp).toBe(Date.UTC(2026, 5, 29));
    expect(second.open).toBe(112);
    expect(second.close).toBe(128);
    expect(second.volume).toBe(40);
  });

  it("keeps a Sunday with its Monday-based week (previous Monday)", () => {
    // 2026-06-28 is a Sunday — belongs to the week starting Mon 2026-06-22.
    const withSunday: Candle[] = [
      daily(2026, 6, 22, 100, 110, 95, 105, 10),
      daily(2026, 6, 28, 105, 112, 104, 109, 5), // Sun
    ];
    const weeks = rollupDaily(withSunday, "W");
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.timestamp).toBe(Date.UTC(2026, 5, 22));
    expect(weeks[0]!.volume).toBe(15);
  });
});

describe("rollupDaily — monthly (calendar month)", () => {
  const series: Candle[] = [
    daily(2026, 5, 28, 90, 95, 88, 92, 7), // May
    daily(2026, 5, 29, 92, 98, 91, 96, 8), // May
    daily(2026, 6, 1, 96, 105, 94, 100, 9), // Jun
    daily(2026, 6, 30, 100, 130, 99, 125, 11), // Jun
  ];

  it("groups by calendar month", () => {
    const months = rollupDaily(series, "M");
    expect(months).toHaveLength(2);

    const may = months[0]!;
    expect(may.timestamp).toBe(Date.UTC(2026, 4, 28));
    expect(may.open).toBe(90);
    expect(may.high).toBe(98);
    expect(may.low).toBe(88);
    expect(may.close).toBe(96);
    expect(may.volume).toBe(15);

    const jun = months[1]!;
    expect(jun.timestamp).toBe(Date.UTC(2026, 5, 1));
    expect(jun.open).toBe(96);
    expect(jun.high).toBe(130);
    expect(jun.low).toBe(94);
    expect(jun.close).toBe(125);
    expect(jun.volume).toBe(20);
  });

  it("returns [] for an empty series", () => {
    expect(rollupDaily([], "M")).toEqual([]);
    expect(rollupDaily([], "W")).toEqual([]);
  });
});
