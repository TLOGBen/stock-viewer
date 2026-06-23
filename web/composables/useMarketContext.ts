/**
 * Per-symbol market context (QM-2). `useStats` fetches `/api/stats/{symbol}`
 * (52-week range, 20d avg volume, market cap, amplitude) and re-fetches whenever
 * the watched symbol changes. Empty / falsy symbols resolve to an idle, null
 * state without hitting the network.
 *
 * SSR-safe: the initial fetch runs client-only (onMounted), and every symbol
 * change is guarded by a request-sequence so a slow in-flight request can never
 * overwrite a newer symbol's result.
 */
import { ref, watch, onMounted, type Ref } from "vue";
import type { SymbolStats, ResourceStatus } from "~/types";

export interface UseStats {
  stats: Ref<SymbolStats | null>;
  status: Ref<ResourceStatus>;
}

export function useStats(symbolRef: Ref<string>): UseStats {
  const { apiBase } = useApi();
  const stats: Ref<SymbolStats | null> = ref(null);
  const status: Ref<ResourceStatus> = ref("idle");

  let requestSeq = 0;

  async function load(symbol: string): Promise<void> {
    const trimmed = symbol.trim();
    const seq = ++requestSeq;

    if (trimmed.length === 0) {
      stats.value = null;
      status.value = "idle";
      return;
    }

    status.value = "loading";
    try {
      const res = await $fetch<SymbolStats>(
        `${apiBase}/api/stats/${encodeURIComponent(trimmed)}`,
      );
      if (seq !== requestSeq) return; // superseded by a newer symbol
      stats.value = res ?? null;
      status.value = res ? "success" : "empty";
    } catch (error) {
      if (seq !== requestSeq) return;
      console.error("useStats: fetch failed", error);
      stats.value = null;
      status.value = "error";
    }
  }

  // Re-fetch on symbol change. Initial load is deferred to onMounted so the
  // request never fires during SSR.
  watch(symbolRef, (next) => {
    void load(next);
  });

  onMounted(() => {
    if (!import.meta.client) return;
    void load(symbolRef.value);
  });

  return { stats, status };
}
