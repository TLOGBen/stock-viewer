import { describe, it, expect } from "vitest";
import { gregorianToRocPacked } from "../src/domain/twseDates.js";
import { rocYYYMM } from "../src/domain/twseDates.js";

/**
 * TASK-domain-02 — convert FinMind's Gregorian "YYYY-MM-DD" into the ROC-packed
 * date string ValuationPoint.date stores ("1150624"). MUST NOT route through
 * rocYYYMM, whose `^\d{4,6}$` regex rejects hyphenated dates.
 */
describe("gregorianToRocPacked", () => {
  it("converts a Gregorian date to ROC packed (year-1911 + MMDD)", () => {
    expect(gregorianToRocPacked("2026-06-24")).toBe("1150624");
  });

  it("zero-pads month and day", () => {
    expect(gregorianToRocPacked("2005-01-03")).toBe("940103");
  });

  it("returns null for malformed input (does not throw)", () => {
    expect(gregorianToRocPacked("2026/06/24")).toBeNull();
    expect(gregorianToRocPacked("")).toBeNull();
    expect(gregorianToRocPacked("not-a-date")).toBeNull();
  });

  it("guards the documented contract: rocYYYMM rejects the hyphenated form", () => {
    // The reason this helper exists — confirm the wrong path is genuinely wrong.
    expect(rocYYYMM("2026-06-24")).toBeNull();
  });
});
