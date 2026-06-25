import { describe, it, expect } from "vitest";
import {
  signalClass,
  faceLabel,
  stateBlockText,
  isStateLine,
  resolveObjectStatus,
  resolveSeriesStatus,
} from "../utils/stockSignals";
import type { ResourceStatus } from "../types";

describe("signalClass", () => {
  // 語意鐵律: bullish=看漲=紅=c-up, bearish=看跌=綠=c-down, neutral=灰=c-flat
  it("maps bullish to the up (red) class", () => {
    expect(signalClass("bullish")).toBe("c-up");
  });

  it("maps bearish to the down (green) class", () => {
    expect(signalClass("bearish")).toBe("c-down");
  });

  it("maps neutral to the flat (grey) class", () => {
    expect(signalClass("neutral")).toBe("c-flat");
  });
});

describe("faceLabel", () => {
  it("labels each of the four faces in Chinese", () => {
    expect(faceLabel("fundamental")).toBe("基本面");
    expect(faceLabel("chip")).toBe("籌碼面");
    expect(faceLabel("technical")).toBe("技術面");
    expect(faceLabel("valuation")).toBe("估值面");
  });
});

describe("stateBlockText", () => {
  it("renders loading copy", () => {
    expect(stateBlockText("loading")).toBe("載入中…");
  });

  it("renders the accumulating copy with the period count", () => {
    expect(stateBlockText("accumulating", 3)).toBe("歷史累積中（3 期）");
  });

  it("renders accumulating without a count when n is absent", () => {
    expect(stateBlockText("accumulating")).toBe("歷史累積中");
    expect(stateBlockText("accumulating", null)).toBe("歷史累積中");
  });

  it("renders empty copy", () => {
    expect(stateBlockText("empty")).toBe("無資料");
  });

  it("renders error copy", () => {
    expect(stateBlockText("error")).toBe("載入失敗");
  });

  it("renders no line for content states (idle / success)", () => {
    expect(stateBlockText("idle")).toBe("");
    expect(stateBlockText("success")).toBe("");
  });
});

describe("isStateLine", () => {
  it("is true for all non-content states", () => {
    const lines: ResourceStatus[] = [
      "loading",
      "error",
      "empty",
      "accumulating",
    ];
    for (const s of lines) expect(isStateLine(s)).toBe(true);
  });

  it("is false for content states", () => {
    expect(isStateLine("idle")).toBe(false);
    expect(isStateLine("success")).toBe(false);
  });
});

describe("resolveObjectStatus", () => {
  it("maps a null result (failed/empty fetch) to error", () => {
    expect(resolveObjectStatus(null)).toBe("error");
  });

  it("maps coverage=false to empty", () => {
    expect(resolveObjectStatus({ coverage: false })).toBe("empty");
  });

  it("maps a present, covered object to success", () => {
    expect(resolveObjectStatus({ coverage: true })).toBe("success");
  });

  it("treats a present object without a coverage field as success", () => {
    // e.g. HealthLights has no coverage field of its own.
    expect(resolveObjectStatus({})).toBe("success");
  });
});

describe("resolveSeriesStatus", () => {
  it("maps a failed fetch (ok=false) to error", () => {
    expect(resolveSeriesStatus(null, false)).toBe("error");
    expect(resolveSeriesStatus(5, false)).toBe("error");
  });

  it("maps an empty / null series to empty", () => {
    expect(resolveSeriesStatus(0, true)).toBe("empty");
    expect(resolveSeriesStatus(null, true)).toBe("empty");
  });

  it("maps a series shorter than minPeriods to accumulating", () => {
    // cold-start single revenue point with a 2-period gate
    expect(resolveSeriesStatus(1, true, 2)).toBe("accumulating");
    // valuation band needs 5 points
    expect(resolveSeriesStatus(4, true, 5)).toBe("accumulating");
  });

  it("maps a series at or above minPeriods to success", () => {
    expect(resolveSeriesStatus(2, true, 2)).toBe("success");
    expect(resolveSeriesStatus(12, true, 5)).toBe("success");
  });

  it("treats any non-empty series as success when minPeriods<=1 (no gate)", () => {
    expect(resolveSeriesStatus(1, true)).toBe("success");
  });
});
