<script setup lang="ts">
/**
 * Provenance chip. When a quote's `source` is "official-close" the numbers are
 * the official TWSE daily close used as a fallback while the live MIS feed is
 * down — NOT a real-time tick. We surface a "官方收盤" badge so the user knows
 * the figure is a non-live floor. Live quotes (source absent ⇒ "mis") render
 * nothing. Uses the warn/amber palette, deliberately NOT the 紅漲綠跌 colours.
 */
import { computed } from "vue";
import type { QuoteSource } from "~/types";

const props = defineProps<{ source?: QuoteSource }>();

const isFallback = computed(() => props.source === "official-close");
</script>

<template>
  <span
    v-if="isFallback"
    class="tag source-badge"
    role="status"
    aria-label="此報價為官方收盤備援，非即時資料"
    title="MIS 即時來源異常，顯示官方每日收盤（非即時）"
  >
    <span class="source-dot" aria-hidden="true" />
    <span class="source-label">官方收盤</span>
  </span>
</template>

<style scoped>
/* squared terminal chip — inherits .tag (mono, border, surface-3) */
.source-badge {
  white-space: nowrap;
  color: var(--warn);
  border-color: var(--warn);
}

.source-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: var(--warn);
}

.source-label {
  letter-spacing: 0.04em;
}
</style>
