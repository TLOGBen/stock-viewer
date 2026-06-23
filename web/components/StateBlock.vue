<script setup lang="ts">
/**
 * Presentational block for an async resource's non-success states (PQ-4):
 * loading (spinner + 載入中…), error (載入失敗 + retry button), empty (無資料),
 * and a disconnected variant. Centered, muted styling. Renders nothing on
 * "idle" or "success" (the caller shows real content then).
 *
 * Emits "retry" from the error/disconnected retry button.
 */
import { computed } from "vue";
import type { ResourceStatus } from "~/types";

type BlockStatus = ResourceStatus | "disconnected";

const props = defineProps<{
  status: BlockStatus;
  message?: string;
}>();

const emit = defineEmits<{ retry: [] }>();

const visible = computed(
  () => props.status !== "idle" && props.status !== "success",
);

const defaultMessage = computed(() => {
  switch (props.status) {
    case "loading":
      return "載入中…";
    case "error":
      return "載入失敗";
    case "empty":
      return "無資料";
    case "disconnected":
      return "連線中斷";
    default:
      return "";
  }
});

const text = computed(() => props.message ?? defaultMessage.value);
const canRetry = computed(
  () => props.status === "error" || props.status === "disconnected",
);
const ariaLive = computed(() => (props.status === "error" ? "assertive" : "polite"));
</script>

<template>
  <div
    v-if="visible"
    class="state-block"
    :class="`state-${props.status}`"
    role="status"
    :aria-live="ariaLive"
  >
    <span v-if="props.status === 'loading'" class="spinner" aria-hidden="true" />
    <span v-else class="state-glyph" aria-hidden="true">
      {{ props.status === "error" ? "⚠" : props.status === "disconnected" ? "⚡" : "∅" }}
    </span>

    <p class="state-text">{{ text }}</p>

    <button
      v-if="canRetry"
      type="button"
      class="btn btn-ghost state-retry"
      @click="emit('retry')"
    >
      重試
    </button>
  </div>
</template>

<style scoped>
.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 28px 16px;
  text-align: center;
  color: var(--text-3);
  min-height: 96px;
}

/* mono tracked terminal label — no decoration */
.state-text {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.08em;
}

.state-glyph {
  font-size: 18px;
  line-height: 1;
  color: var(--text-dim);
}

.state-error {
  color: var(--bad);
}

.state-disconnected {
  color: var(--warn);
}

.state-retry {
  margin-top: 2px;
}

.spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--hairline);
  border-top-color: var(--accent);
  animation: state-spin 0.8s linear infinite;
}

@keyframes state-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 2s;
  }
}
</style>
