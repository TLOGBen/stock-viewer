import { describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFundamentalsClient,
  createChipsClient,
  createValuationClient,
} from "../src/adapters/index.js";
import {
  parseRevenueRow,
  parseT86Row,
  parseMarginRow,
  parseBwibbuRow,
} from "../src/domain/index.js";

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

/** Load a JSON fixture captured from a real TWSE endpoint (offline). */
async function fixture<T>(name: string): Promise<T> {
  const raw = await fs.readFile(path.join(FIXTURES, name), "utf8");
  return JSON.parse(raw) as T;
}

/** Build a fake `fetch` returning `body` as JSON and recording the called URL. */
function fakeFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => {
    return { ok, status, json: async () => body } as unknown as Response;
  });
  return fn as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

describe("fundamentalsClient (opendata object rows)", () => {
  it("returns raw rows and the domain parser yields 1513's true 當月營收 (千元)", async () => {
    // ap05-revenue.json captured live: 1513 2026-05 當月營收 = 2392022 千元.
    const rows = await fixture<Record<string, unknown>[]>("ap05-revenue.json");
    const fetchImpl = fakeFetch(rows);
    const client = createFundamentalsClient(fetchImpl);

    const got = await client.fetchRows(
      "https://openapi.twse.com.tw/v1/opendata/t187ap05_L",
    );
    expect(got).toHaveLength(rows.length);

    const r1513 = got.find((r) => r["公司代號"] === "1513")!;
    const rev = parseRevenueRow(r1513);
    expect(rev).not.toBeNull();
    expect(rev!.yearMonth).toBe("2026-05");
    expect(rev!.revenueThousands).toBe(2392022); // known true value, 千元
  });

  it("returns [] when the body is not a JSON array (never throws)", async () => {
    const client = createFundamentalsClient(fakeFetch({ unexpected: "shape" }));
    await expect(
      client.fetchRows("https://openapi.twse.com.tw/v1/opendata/t187ap05_L"),
    ).resolves.toEqual([]);
  });

  it("throws on a non-2xx response (boundary)", async () => {
    const client = createFundamentalsClient(fakeFetch([], false, 503));
    await expect(
      client.fetchRows("https://openapi.twse.com.tw/v1/opendata/t187ap05_L"),
    ).rejects.toThrow(/503/);
  });
});

describe("chipsClient — T86 by-date (rwd {fields,data})", () => {
  it("requests the date+selectType params and parses 1513 三大法人合計 股→張", async () => {
    // t86-20260624.json captured live: 1513 三大法人買賣超股數 = 945,506 股.
    const resp = await fixture<{ stat: string; fields: unknown[]; data: unknown[][] }>(
      "t86-20260624.json",
    );
    const fetchImpl = fakeFetch(resp);
    const client = createChipsClient(fetchImpl);

    const got = await client.fetchT86ByDate("20260624");

    const url = String(fetchImpl.mock.calls[0]![0]);
    expect(url).toContain("date=20260624");
    expect(url).toContain("selectType=ALL");
    expect(url).toContain("response=json");

    const row = got.data!.find((r) => String(r[0]).trim() === "1513")!;
    const flow = parseT86Row(got.fields!, row);
    // 945,506 股 → 945.506 張 (known true value, /1000).
    expect(flow.totalNet).toBeCloseTo(945.506, 3);
    // 投信買賣超 4,369,580 股 → 4369.58 張.
    expect(flow.trustNet).toBeCloseTo(4369.58, 2);
  });
});

describe("chipsClient — MI_MARGN (openapi object rows)", () => {
  it("parses 1513's true 融資/融券今日餘額 in 張 (NOT divided)", async () => {
    // mi-margn.json captured live: 1513 融資今日餘額 10160 張, 融券今日餘額 89 張.
    const rows = await fixture<Record<string, unknown>[]>("mi-margn.json");
    const client = createChipsClient(fakeFetch(rows));

    const got = await client.fetchMarginRows();
    const r1513 = got.find((r) => r["股票代號"] === "1513")!;
    const margin = parseMarginRow(r1513);
    expect(margin.marginBalance).toBe(10160); // 張, not /1000
    expect(margin.shortBalance).toBe(89); // 張
    // 券資比 % = 89 / 10160 * 100.
    expect(margin.shortMarginRatioPct).toBeCloseTo((89 / 10160) * 100, 6);
  });

  it("returns [] on a non-array body and throws on non-2xx", async () => {
    await expect(
      createChipsClient(fakeFetch("nope")).fetchMarginRows(),
    ).resolves.toEqual([]);
    await expect(
      createChipsClient(fakeFetch([], false, 500)).fetchMarginRows(),
    ).rejects.toThrow(/500/);
  });
});

describe("valuationClient — BWIBBU_ALL (openapi object rows)", () => {
  it("parses 1513's true PE 22.48 / PB 4.25 from the same row", async () => {
    // bwibbu-all.json captured live: 1513 PEratio 22.48, PBratio 4.25.
    const rows = await fixture<Record<string, unknown>[]>("bwibbu-all.json");
    const client = createValuationClient(fakeFetch(rows));

    const got = await client.fetchBwibbuRows();
    const r1513 = got.find((r) => r["Code"] === "1513")!;
    const vp = parseBwibbuRow(r1513);
    expect(vp.pe).toBe(22.48); // known true value
    expect(vp.pb).toBe(4.25); // known true value
  });
});

describe("valuationClient — TWT49U (rwd {fields,data})", () => {
  it("returns the raw rwd envelope with fields + data rows", async () => {
    // twt49u.json captured live: rwd {fields,data}; 資料日期 is a Chinese ROC date.
    const resp = await fixture<{ stat: string; fields: unknown[]; data: unknown[][] }>(
      "twt49u.json",
    );
    const fetchImpl = fakeFetch(resp);
    const client = createValuationClient(fetchImpl);

    const got = await client.fetchExRight();
    expect(String(fetchImpl.mock.calls[0]![0])).toContain("response=json");
    expect(got.fields).toContain("資料日期");
    expect(Array.isArray(got.data)).toBe(true);
    expect(got.data!.length).toBeGreaterThan(0);
    // First column of every row is a Chinese ROC date like "115年06月25日".
    expect(String(got.data![0]![0])).toMatch(/^\d+年\d+月\d+日$/);
  });
});
