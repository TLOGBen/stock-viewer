/**
 * Unit tests for the pure InstitutionalTable transforms (utils/institutionalTable).
 *
 * Fixtures mirror the shape returned by GET /api/institutional/:symbol, whose
 * net figures are already in 張 (lots) — domain parseT86Row converts 股→張
 * (/1000) upstream, so these transforms only format and never re-scale.
 */
import { describe, it, expect } from "vitest";
import type { InstitutionalDay } from "~/types";
import {
  formatTradeDate,
  toFlowCell,
  institutionalToRows,
} from "~/utils/institutionalTable";

describe("formatTradeDate", () => {
  it("formats an 8-digit YYYYMMDD key as YYYY-MM-DD", () => {
    expect(formatTradeDate("20240625")).toBe("2024-06-25");
  });

  it("passes unrecognised input through untouched", () => {
    expect(formatTradeDate("2024-06-25")).toBe("2024-06-25");
    expect(formatTradeDate("")).toBe("");
  });
});

describe("toFlowCell — 紅漲綠跌 (買超正=紅 賣超負=綠)", () => {
  it("colours a 買超 (positive 張) red via c-up", () => {
    const cell = toFlowCell(12345);
    expect(cell.value).toBe(12345);
    expect(cell.text).toBe("12,345");
    expect(cell.cls).toBe("c-up");
  });

  it("colours a 賣超 (negative 張) green via c-down", () => {
    const cell = toFlowCell(-6789);
    expect(cell.text).toBe("-6,789");
    expect(cell.cls).toBe("c-down");
  });

  it("renders a blank column as 「—」/ c-flat", () => {
    const cell = toFlowCell(null);
    expect(cell).toEqual({ value: null, text: "—", cls: "c-flat" });
  });

  it("treats exactly zero as flat", () => {
    expect(toFlowCell(0).cls).toBe("c-flat");
  });
});

describe("institutionalToRows", () => {
  // unit 量綱: every *Net is 張 (lots), already /1000 from 股 upstream.
  const days: InstitutionalDay[] = [
    {
      date: "20240624",
      foreignNet: 1000,
      trustNet: -200,
      dealerNet: 50,
      totalNet: 850,
    },
    {
      date: "20240625",
      foreignNet: -3000,
      trustNet: 100,
      dealerNet: null,
      totalNet: -2900,
    },
  ];

  it("orders newest day first regardless of input order", () => {
    const rows = institutionalToRows(days);
    expect(rows.map((r) => r.date)).toEqual(["20240625", "20240624"]);
  });

  it("shapes each cell with text + colour and a pretty date", () => {
    const [latest] = institutionalToRows(days);
    expect(latest.dateLabel).toBe("2024-06-25");
    expect(latest.foreign).toEqual({
      value: -3000,
      text: "-3,000",
      cls: "c-down",
    });
    expect(latest.dealer.text).toBe("—");
    expect(latest.total.cls).toBe("c-down");
  });

  it("does not mutate the source array", () => {
    const snapshot = days.map((d) => d.date);
    institutionalToRows(days);
    expect(days.map((d) => d.date)).toEqual(snapshot);
  });

  it("returns an empty array for no days", () => {
    expect(institutionalToRows([])).toEqual([]);
  });
});
