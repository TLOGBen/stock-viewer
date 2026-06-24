import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { config } from "../src/config.js";
import type { InstrumentMeta } from "../src/domain/types.js";
import {
  buildExCh,
  computeMarketStatus,
  numOrNull,
  parseLevels,
  parseMisResponse,
} from "../src/domain/index.js";

/** Real captured TWSE MIS payload (all z === "-", populated book/o/h/l/y). */
const sample = JSON.parse(
  readFileSync(new URL("./fixtures/mis-sample.json", import.meta.url), "utf8"),
) as unknown;

/** metaBySymbol built from the same 8 instruments as config.ts. */
function buildMetaBySymbol(): Map<string, InstrumentMeta> {
  const map = new Map<string, InstrumentMeta>();
  for (const inst of config.instruments) map.set(inst.symbol, inst);
  return map;
}

describe("numOrNull", () => {
  it("treats the TWSE placeholder dash as null", () => {
    expect(numOrNull("-")).toBe(null);
  });

  it("treats empty / whitespace strings as null", () => {
    expect(numOrNull("")).toBe(null);
    expect(numOrNull("   ")).toBe(null);
  });

  it("treats null and undefined as null", () => {
    expect(numOrNull(null)).toBe(null);
    expect(numOrNull(undefined)).toBe(null);
  });

  it("parses a well-formed numeric string", () => {
    expect(numOrNull("265.0000")).toBe(265);
    expect(numOrNull("2517.5000")).toBe(2517.5);
  });

  it("returns null for non-numeric text", () => {
    expect(numOrNull("abc")).toBe(null);
  });

  it("parses a numeric value passed as a number", () => {
    expect(numOrNull(8512)).toBe(8512);
  });
});

describe("buildExCh", () => {
  it("joins instruments as ${exch}_${symbol}.tw with a pipe", () => {
    const result = buildExCh([
      { symbol: "2330", name: "台積電", exch: "tse" },
      { symbol: "2317", name: "鴻海", exch: "tse" },
    ]);
    expect(result).toBe("tse_2330.tw|tse_2317.tw");
  });

  it("returns an empty string for no instruments", () => {
    expect(buildExCh([])).toBe("");
  });

  it("builds a single instrument without a trailing pipe", () => {
    expect(buildExCh([{ symbol: "0050", name: "元大台灣50", exch: "tse" }])).toBe(
      "tse_0050.tw",
    );
  });
});

describe("parseLevels", () => {
  it("zips price and size strings into ascending/index-aligned levels", () => {
    expect(parseLevels("265.0_266.0_", "10_20_")).toEqual([
      { price: 265, size: 10 },
      { price: 266, size: 20 },
    ]);
  });

  it("zips to the shorter side when lengths mismatch", () => {
    expect(parseLevels("265.0_266.0_267.0_", "10_20_")).toEqual([
      { price: 265, size: 10 },
      { price: 266, size: 20 },
    ]);
    expect(parseLevels("265.0_", "10_20_30_")).toEqual([
      { price: 265, size: 10 },
    ]);
  });

  it("returns an empty array for missing strings", () => {
    expect(parseLevels(undefined, undefined)).toEqual([]);
    expect(parseLevels("", "")).toEqual([]);
  });

  it("parses the real five-level book for 2330 (asks, ascending)", () => {
    // a / f from the fixture for 2330.
    const levels = parseLevels(
      "2520.0000_2525.0000_2530.0000_2535.0000_2540.0000_",
      "199_322_602_499_297_",
    );
    expect(levels).toHaveLength(5);
    expect(levels[0]).toEqual({ price: 2520, size: 199 });
    expect(levels[4]).toEqual({ price: 2540, size: 297 });
  });
});

describe("parseMisResponse", () => {
  const metaBySymbol = buildMetaBySymbol();
  const now = Date.UTC(2026, 5, 22, 2, 0); // fixed epoch (10:00 TPE Mon)

  it("returns one quote per fixture item (8 total)", () => {
    const quotes = parseMisResponse(sample, metaBySymbol, new Map(), now);
    expect(quotes).toHaveLength(8);
  });

  it("normalizes 2330 using the bid/ask midpoint when z and pz are dashes", () => {
    const quotes = parseMisResponse(sample, metaBySymbol, new Map(), now);
    const tsmc = quotes.find((q) => q.symbol === "2330");
    expect(tsmc).toBeDefined();
    if (!tsmc) return;

    // meta carried from config.ts
    expect(tsmc.name).toBe("台積電");
    expect(tsmc.exch).toBe("tse");

    // prevClose from y
    expect(tsmc.prevClose).toBe(2510);

    // z === "-" & pz === "-" & no carried prevPrice → midpoint of best bid/ask.
    // bestBid = 2515 (b descending), bestAsk = 2520 (a ascending) → 2517.5
    expect(tsmc.price).toBe(2517.5);

    // 累積成交量
    expect(tsmc.volume).toBe(8512);
  });

  it("orders the 2330 book correctly (bids descending, asks ascending)", () => {
    const quotes = parseMisResponse(sample, metaBySymbol, new Map(), now);
    const tsmc = quotes.find((q) => q.symbol === "2330");
    expect(tsmc).toBeDefined();
    if (!tsmc) return;

    expect(tsmc.bids).toHaveLength(5);
    expect(tsmc.asks).toHaveLength(5);

    // bids descending
    expect(tsmc.bids[0]?.price).toBe(2515);
    expect(tsmc.bids[4]?.price).toBe(2495);
    for (let i = 1; i < tsmc.bids.length; i++) {
      expect(tsmc.bids[i]!.price).toBeLessThan(tsmc.bids[i - 1]!.price);
    }

    // asks ascending
    expect(tsmc.asks[0]?.price).toBe(2520);
    expect(tsmc.asks[4]?.price).toBe(2540);
    for (let i = 1; i < tsmc.asks.length; i++) {
      expect(tsmc.asks[i]!.price).toBeGreaterThan(tsmc.asks[i - 1]!.price);
    }
  });

  it("classifies 2330 direction as up (紅漲: 2517.5 > prevClose 2510)", () => {
    const quotes = parseMisResponse(sample, metaBySymbol, new Map(), now);
    const tsmc = quotes.find((q) => q.symbol === "2330");
    expect(tsmc?.direction).toBe("up");
  });

  it("computes change and changePercent against prevClose", () => {
    const quotes = parseMisResponse(sample, metaBySymbol, new Map(), now);
    const tsmc = quotes.find((q) => q.symbol === "2330");
    expect(tsmc).toBeDefined();
    if (!tsmc) return;
    expect(tsmc.change).toBeCloseTo(7.5, 5); // 2517.5 - 2510
    expect(tsmc.changePercent).toBeCloseTo((7.5 / 2510) * 100, 5);
  });

  it("stamps updatedAt with the provided now", () => {
    const quotes = parseMisResponse(sample, metaBySymbol, new Map(), now);
    const tsmc = quotes.find((q) => q.symbol === "2330");
    expect(tsmc?.updatedAt).toBe(now);
  });

  it("tolerates a missing msgArray and returns no quotes", () => {
    expect(parseMisResponse({}, metaBySymbol, new Map(), now)).toEqual([]);
    expect(parseMisResponse({ msgArray: [] }, metaBySymbol, new Map(), now)).toEqual(
      [],
    );
  });

  it("ignores items without a symbol", () => {
    const json = { msgArray: [{ n: "noSymbol", z: "10" }] };
    expect(parseMisResponse(json, metaBySymbol, new Map(), now)).toEqual([]);
  });
});

describe("computeMarketStatus", () => {
  it("reports an open session at 10:00 TPE on a weekday", () => {
    const now = Date.UTC(2026, 5, 22, 2, 0); // 10:00 TPE Mon (02:00 UTC)
    const status = computeMarketStatus(now);
    expect(status.session).toBe("open");
    expect(status.label).toBe("開盤中");
    expect(status.isOpen).toBe(true);
    expect(status.serverTime).toBe(now);
  });

  it("reports closed / 休市 on a Saturday", () => {
    const now = Date.UTC(2026, 5, 20, 2, 0); // 10:00 TPE Sat (02:00 UTC)
    const status = computeMarketStatus(now);
    expect(status.session).toBe("closed");
    expect(status.label).toBe("休市");
    expect(status.isOpen).toBe(false);
  });

  it("reports pre / 盤前 at 08:45 TPE on a weekday", () => {
    const now = Date.UTC(2026, 5, 22, 0, 45); // 08:45 TPE Mon (00:45 UTC)
    const status = computeMarketStatus(now);
    expect(status.session).toBe("pre");
    expect(status.label).toBe("盤前");
    expect(status.isOpen).toBe(false);
  });
});
