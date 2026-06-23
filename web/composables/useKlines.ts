/**
 * Reactive K-line data source for one symbol+interval.
 *
 * - Fetches up to 400 historical bars via `useApi().fetchKlines`.
 * - Re-fetches whenever the symbol or interval changes.
 * - Folds live `lastCandle` events from `useMarketData()` into the forming bar:
 *   appends a new bar when the timestamp is newer, replaces the last bar when it
 *   matches (the forming bar updating in place). Only events whose symbol AND
 *   interval match the current context are folded.
 *
 * All updates are immutable (new arrays / new candle objects).
 */
import { ref, watch, type Ref } from "vue";
import type { Candle, KlineInterval, ResourceStatus } from "~/types";

export interface UseKlines {
  candles: Ref<Candle[]>;
  status: Ref<ResourceStatus>;
}

export function useKlines(
  symbolRef: Ref<string>,
  intervalRef: Ref<KlineInterval>,
): UseKlines {
  const candles: Ref<Candle[]> = ref([]);
  const status: Ref<ResourceStatus> = ref("idle");

  const { fetchKlines } = useApi();
  const md = useMarketData();

  // Guards against a stale fetch (slow response for a prior symbol/interval)
  // overwriting newer data after the user switches context.
  let requestSeq = 0;

  async function load(symbol: string, interval: KlineInterval): Promise<void> {
    if (!symbol) {
      candles.value = [];
      status.value = "empty";
      return;
    }
    const seq = ++requestSeq;
    status.value = "loading";
    try {
      const data = await fetchKlines(symbol, interval);
      if (seq !== requestSeq) return; // superseded by a newer request
      candles.value = data;
      status.value = data.length === 0 ? "empty" : "success";
    } catch (error) {
      if (seq !== requestSeq) return;
      console.error("useKlines: load failed", error);
      candles.value = [];
      status.value = "error";
    }
  }

  // Initial load + re-fetch on symbol/interval change.
  watch(
    [symbolRef, intervalRef],
    ([symbol, interval]) => {
      void load(symbol, interval);
    },
    { immediate: true },
  );

  // Fold live candle events into the forming bar (immutably).
  watch(
    md.lastCandle,
    (ev) => {
      if (ev === null) return;
      if (ev.symbol !== symbolRef.value) return;
      if (ev.interval !== intervalRef.value) return;

      const current = candles.value;
      const last = current[current.length - 1];

      if (last === undefined || ev.candle.timestamp > last.timestamp) {
        // A brand-new bar started: append.
        candles.value = [...current, ev.candle];
      } else if (ev.candle.timestamp === last.timestamp) {
        // The forming (or just-closed) bar updated in place: replace last.
        const next = current.slice(0, current.length - 1);
        next.push(ev.candle);
        candles.value = next;
      }
      // Older-than-last timestamps are ignored (out-of-order / stale).
    },
    { flush: "post" },
  );

  return { candles, status };
}
