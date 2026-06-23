/**
 * Generic async resource state machine (PQ-4). Wraps a fetcher in an explicit
 * idle → loading → (success | empty | error) lifecycle so UI surfaces never
 * silently swallow errors or show a stale spinner forever.
 *
 * - Runs the fetcher once on mount (client-only) and on every `reload()`.
 * - `empty` is reported when the result is an empty array; any other value
 *   (including objects, non-empty arrays, or scalars) is `success`.
 * - A request-sequence guard prevents a slow in-flight fetch from overwriting a
 *   newer one.
 *
 * All state lives in refs; updates are immutable assignments.
 */
import { ref, onMounted, type Ref } from "vue";
import type { ResourceStatus } from "~/types";

export interface UseAsyncResource<T> {
  status: Ref<ResourceStatus>;
  data: Ref<T | null>;
  error: Ref<string | null>;
  reload: () => Promise<void>;
}

function isEmptyResult(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "載入失敗";
}

export function useAsyncResource<T>(fetcher: () => Promise<T>): UseAsyncResource<T> {
  const status: Ref<ResourceStatus> = ref("idle");
  const data: Ref<T | null> = ref(null) as Ref<T | null>;
  const error: Ref<string | null> = ref(null);

  let requestSeq = 0;

  async function reload(): Promise<void> {
    const seq = ++requestSeq;
    status.value = "loading";
    error.value = null;
    try {
      const result = await fetcher();
      if (seq !== requestSeq) return; // superseded by a newer request
      data.value = result;
      status.value = isEmptyResult(result) ? "empty" : "success";
    } catch (err) {
      if (seq !== requestSeq) return;
      console.error("useAsyncResource: fetch failed", err);
      data.value = null;
      error.value = messageOf(err);
      status.value = "error";
    }
  }

  onMounted(() => {
    if (!import.meta.client) return;
    void reload();
  });

  return { status, data, error, reload };
}
