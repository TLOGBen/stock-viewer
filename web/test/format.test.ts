import { describe, it, expect } from "vitest";
import {
  formatPrice,
  formatChange,
  formatPercent,
  formatVolume,
  formatInt,
  formatTime,
  signClass,
  arrow,
  directionOf,
} from "../utils/format";

describe("formatPrice", () => {
  it("renders null as em-dash", () => {
    expect(formatPrice(null)).toBe("—");
  });

  it("renders a number with two decimals by default", () => {
    expect(formatPrice(265)).toBe("265.00");
  });

  it("honors a custom decimal-place count", () => {
    expect(formatPrice(265, 1)).toBe("265.0");
  });

  it("renders non-finite values as em-dash", () => {
    expect(formatPrice(Number.NaN)).toBe("—");
  });
});

describe("formatChange", () => {
  it("renders zero with no sign", () => {
    expect(formatChange(0)).toBe("0.00");
  });

  it("prefixes positive values with +", () => {
    expect(formatChange(1.5)).toBe("+1.50");
  });

  it("prefixes negative values with -", () => {
    expect(formatChange(-1.5)).toBe("-1.50");
  });
});

describe("formatPercent", () => {
  it("formats and rounds a positive percent", () => {
    expect(formatPercent(0.567)).toBe("+0.57%");
  });

  it("formats and rounds a negative percent", () => {
    expect(formatPercent(-0.567)).toBe("-0.57%");
  });

  it("renders zero with no sign", () => {
    expect(formatPercent(0)).toBe("0.00%");
  });
});

describe("formatVolume", () => {
  it("groups thousands", () => {
    expect(formatVolume(17575)).toBe("17,575");
  });
});

describe("formatInt", () => {
  it("groups thousands", () => {
    expect(formatInt(1234567)).toBe("1,234,567");
  });
});

describe("arrow", () => {
  it("maps up to ▲", () => {
    expect(arrow("up")).toBe("▲");
  });

  it("maps down to ▼", () => {
    expect(arrow("down")).toBe("▼");
  });

  it("maps flat to —", () => {
    expect(arrow("flat")).toBe("—");
  });
});

describe("signClass", () => {
  it("maps up to c-up", () => {
    expect(signClass("up")).toBe("c-up");
  });

  it("maps down to c-down", () => {
    expect(signClass("down")).toBe("c-down");
  });

  it("maps flat to c-flat", () => {
    expect(signClass("flat")).toBe("c-flat");
  });
});

describe("directionOf", () => {
  it("maps a positive number to up", () => {
    expect(directionOf(1)).toBe("up");
  });

  it("maps a negative number to down", () => {
    expect(directionOf(-1)).toBe("down");
  });

  it("maps zero to flat", () => {
    expect(directionOf(0)).toBe("flat");
  });
});

describe("formatTime", () => {
  it("returns an HH:MM:SS pattern", () => {
    expect(formatTime(Date.now())).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("formats a known epoch in Taipei time (UTC+8)", () => {
    // 1970-01-01T00:00:00Z -> 08:00:00 in TPE.
    expect(formatTime(0)).toBe("08:00:00");
  });
});
