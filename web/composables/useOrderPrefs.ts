/**
 * localStorage-backed order preferences (TP-7). Currently just the
 * "skip confirmation dialog" flag toggled via the ConfirmOrderDialog
 * 「不再提醒」 checkbox. Client-guarded and SSR-safe; on the server the
 * ref defaults to false and writes are no-ops.
 */
import { ref, type Ref } from "vue";

const STORAGE_KEY = "twdesk.skipConfirm";

// Module-scoped singleton so every caller shares the same reactive flag.
const skipConfirm: Ref<boolean> = ref(false);
let hydrated = false;

/** Read the persisted flag once on the client. */
function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (!import.meta.client) return;
  try {
    skipConfirm.value = window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch (error) {
    console.error("useOrderPrefs: read failed", error);
  }
}

/** Set + persist the skip-confirm flag. No-op write on the server. */
function setSkipConfirm(v: boolean): void {
  skipConfirm.value = v;
  if (!import.meta.client) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, v ? "true" : "false");
  } catch (error) {
    console.error("useOrderPrefs: write failed", error);
  }
}

export function useOrderPrefs(): {
  skipConfirm: Ref<boolean>;
  setSkipConfirm: (v: boolean) => void;
} {
  hydrate();
  return { skipConfirm, setSkipConfirm };
}
