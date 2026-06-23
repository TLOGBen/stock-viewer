import { describe, it, expect } from "vitest";
import { freshnessOf, STALE_AFTER_MS } from "../composables/useFreshness";

const NOW = 1_700_000_000_000;

describe("freshnessOf", () => {
  it("returns closed when the market session is closed, regardless of tick age", () => {
    expect(freshnessOf(NOW, NOW, true)).toBe("closed");
  });

  it("returns closed even with a fresh tick when market is closed", () => {
    expect(freshnessOf(NOW - 100, NOW, true)).toBe("closed");
  });

  it("returns live when open and the last tick is recent", () => {
    expect(freshnessOf(NOW - 1_000, NOW, false)).toBe("live");
  });

  it("returns live exactly at the staleness threshold (not strictly greater)", () => {
    expect(freshnessOf(NOW - STALE_AFTER_MS, NOW, false)).toBe("live");
  });

  it("returns stale when open and no tick for longer than the threshold", () => {
    expect(freshnessOf(NOW - (STALE_AFTER_MS + 1), NOW, false)).toBe("stale");
  });

  it("returns stale when open and the tick is far in the past", () => {
    expect(freshnessOf(NOW - 60_000, NOW, false)).toBe("stale");
  });

  it("returns stale when open but the updatedAt is null (no evidence of a tick)", () => {
    expect(freshnessOf(null, NOW, false)).toBe("stale");
  });

  it("returns stale when open but updatedAt is non-finite", () => {
    expect(freshnessOf(Number.NaN, NOW, false)).toBe("stale");
  });

  it("treats a just-now tick as live", () => {
    expect(freshnessOf(NOW, NOW, false)).toBe("live");
  });

  it("exposes a 12s default staleness threshold", () => {
    expect(STALE_AFTER_MS).toBe(12_000);
  });
});
