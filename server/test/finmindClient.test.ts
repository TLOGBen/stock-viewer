import { describe, expect, it, vi } from "vitest";

import { createFinmindClient } from "../scripts/finmindClient.js";

/** Build a fake `fetch` returning `body` as JSON, tracking calls + urls. */
function fakeFetch(body: unknown, ok = true, httpStatus = 200) {
  const fn = vi.fn(async (url: string) => {
    return {
      ok,
      status: httpStatus,
      json: async () => body,
    } as unknown as Response;
  });
  return fn as unknown as typeof fetch & {
    mock: { calls: [string][]; results: unknown[] };
  };
}

const PER_OK = {
  msg: "success",
  status: 200,
  data: [
    { date: "2024-01-02", stock_id: "1513", dividend_yield: 2.5, PER: 15.1, PBR: 1.2 },
    { date: "2024-01-03", stock_id: "1513", dividend_yield: 2.5, PER: 15.3, PBR: 1.21 },
  ],
};

const REV_OK = {
  msg: "success",
  status: 200,
  data: [{ date: "2024-01-10", stock_id: "1513", revenue: 123456 }],
};

describe("finmindClient", () => {
  describe("token handling", () => {
    it("throws a clear FINMIND_TOKEN error before any fetch when token missing", async () => {
      const fetchImpl = fakeFetch(PER_OK);
      const client = createFinmindClient({ fetchImpl, token: "", throttleMs: 0 });

      await expect(client.fetchPER("1513")).rejects.toThrow(/FINMIND_TOKEN/);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("throws when token is undefined and no env fallback", async () => {
      const fetchImpl = fakeFetch(PER_OK);
      const client = createFinmindClient({
        fetchImpl,
        token: undefined,
        throttleMs: 0,
      });
      // ensure env does not accidentally satisfy it
      const prev = process.env.FINMIND_TOKEN;
      delete process.env.FINMIND_TOKEN;
      try {
        await expect(client.fetchMonthRevenue("1513")).rejects.toThrow(
          /FINMIND_TOKEN/,
        );
        expect(fetchImpl).not.toHaveBeenCalled();
      } finally {
        if (prev !== undefined) process.env.FINMIND_TOKEN = prev;
      }
    });
  });

  describe("successful fetch", () => {
    it("fetchPER returns the raw data array and builds the right URL", async () => {
      const fetchImpl = fakeFetch(PER_OK);
      const client = createFinmindClient({
        fetchImpl,
        token: "tok-123",
        throttleMs: 0,
      });

      const data = await client.fetchPER("1513", "2020-01-01");

      expect(data).toEqual(PER_OK.data);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const url = String(fetchImpl.mock.calls[0]![0]);
      expect(url).toContain("dataset=TaiwanStockPER");
      expect(url).toContain("data_id=1513");
      expect(url).toContain("token=tok-123");
      expect(url).toContain("start_date=2020-01-01");
    });

    it("fetchMonthRevenue uses the TaiwanStockMonthRevenue dataset", async () => {
      const fetchImpl = fakeFetch(REV_OK);
      const client = createFinmindClient({
        fetchImpl,
        token: "tok-123",
        throttleMs: 0,
      });

      const data = await client.fetchMonthRevenue("1513", "2020-01-01");

      expect(data).toEqual(REV_OK.data);
      const url = String(fetchImpl.mock.calls[0]![0]);
      expect(url).toContain("dataset=TaiwanStockMonthRevenue");
      expect(url).toContain("data_id=1513");
    });
  });

  describe("failure surfacing (caller may catch-and-skip)", () => {
    it("throws on non-2xx HTTP response", async () => {
      const fetchImpl = fakeFetch({}, false, 500);
      const client = createFinmindClient({
        fetchImpl,
        token: "tok",
        throttleMs: 0,
      });
      await expect(client.fetchPER("1513")).rejects.toThrow();
    });

    it("throws when body status is not 200", async () => {
      const fetchImpl = fakeFetch({ msg: "rate limit", status: 402, data: [] });
      const client = createFinmindClient({
        fetchImpl,
        token: "tok",
        throttleMs: 0,
      });
      await expect(client.fetchPER("1513")).rejects.toThrow();
    });

    it("surfaces a rejected fetch", async () => {
      const fetchImpl = vi.fn(async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch;
      const client = createFinmindClient({
        fetchImpl,
        token: "tok",
        throttleMs: 0,
      });
      await expect(client.fetchPER("1513")).rejects.toThrow(/network down/);
    });
  });

  describe("throttle", () => {
    it("awaits the injected sleep for >=throttleMs between successive fetches", async () => {
      const fetchImpl = fakeFetch(PER_OK);
      const sleeps: number[] = [];
      const sleep = vi.fn(async (ms: number) => {
        sleeps.push(ms);
      });
      const client = createFinmindClient({
        fetchImpl,
        token: "tok",
        throttleMs: 350,
        sleep,
        now: (() => {
          // virtual clock: each read returns the same instant (no real time passes),
          // so the throttle must rely on the spacing it itself enforces.
          let t = 1_000;
          return () => t;
        })(),
      });

      await client.fetchPER("1513");
      await client.fetchPER("1513");

      // second call must wait ~throttleMs since the first fetch happened at the
      // same virtual instant.
      expect(sleep).toHaveBeenCalled();
      const waited = sleeps.reduce((a, b) => a + b, 0);
      expect(waited).toBeGreaterThanOrEqual(350);
    });

    it("does not sleep when throttleMs is 0", async () => {
      const fetchImpl = fakeFetch(PER_OK);
      const sleep = vi.fn(async () => undefined);
      const client = createFinmindClient({
        fetchImpl,
        token: "tok",
        throttleMs: 0,
        sleep,
      });
      await client.fetchPER("1513");
      await client.fetchPER("1513");
      expect(sleep).not.toHaveBeenCalled();
    });
  });
});
