import { describe, expect, it, vi } from "vitest";

import { getDisclosures } from "../src/usecase/getDisclosures.js";
import type { DisclosureCache } from "../src/usecase/stockPageDeps.js";
import type { Disclosure } from "../src/domain/index.js";

function disc(dateRoc: string, time: string, subject: string): Disclosure {
  return {
    symbol: "1513",
    dateRoc,
    date: Number.parseInt(dateRoc, 10),
    time,
    subject,
    factDateRoc: dateRoc,
  };
}

/** Stub a DisclosureCache whose recent window is the given day maps. */
function cacheOf(
  days: { date: string; map: Map<string, Disclosure[]> }[],
): DisclosureCache {
  return {
    getRecentDays: async () => days,
  } as unknown as DisclosureCache;
}

describe("getDisclosures — dedupe + newest-first + coverage", () => {
  it("de-duplicates the same announcement recurring across snapshots, newest-first", async () => {
    const a = disc("1150624", "64502", "A 最新");
    const b = disc("1150623", "100000", "B 較舊");
    const deps = {
      disclosures: cacheOf([
        { date: "20260624", map: new Map([["1513", [a, b]]]) },
        { date: "20260623", map: new Map([["1513", [b]]]) }, // b recurs
      ]),
    };
    const v = await getDisclosures(deps, "1513");
    expect(v.coverage).toBe(true);
    expect(v.items.map((i) => i.subject)).toEqual(["A 最新", "B 較舊"]);
  });

  it("coverage=false with no items when the symbol never appears", async () => {
    const deps = {
      disclosures: cacheOf([
        { date: "20260624", map: new Map([["2330", [disc("1150624", "1", "X")]]]) },
      ]),
    };
    const v = await getDisclosures(deps, "1513");
    expect(v.coverage).toBe(false);
    expect(v.items).toHaveLength(0);
  });

  it("never throws — a cache failure degrades to empty", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const deps = {
      disclosures: {
        getRecentDays: async () => {
          throw new Error("boom");
        },
      } as unknown as DisclosureCache,
    };
    const v = await getDisclosures(deps, "1513");
    expect(v.coverage).toBe(false);
    vi.restoreAllMocks();
  });
});
