<script setup lang="ts">
/**
 * Limit-up / limit-down lock badge. Renders 漲停 🔒 (c-up red) for lock-up,
 * 跌停 🔒 (c-down green) for lock-down, and nothing when state is null.
 *
 * Information is carried by glyph + text (not colour alone) for accessibility.
 */
import { computed } from "vue";
import type { LimitState } from "~/utils/limitState";

const props = defineProps<{ state: LimitState }>();

const label = computed(() => (props.state === "lock-up" ? "漲停" : "跌停"));
const cls = computed(() => (props.state === "lock-up" ? "c-up" : "c-down"));
</script>

<template>
  <span v-if="props.state" class="tag limit" :class="cls" role="status" :aria-label="`${label}鎖死`">
    <span class="limit-label">{{ label }}</span>
    <span class="limit-lock" aria-hidden="true">🔒</span>
  </span>
</template>

<style scoped>
/* squared terminal chip — inherits .tag; semantic color carried by .c-up/.c-down.
   漲停 = red border/fill tint, 跌停 = green — the lock glyph + text carry meaning. */
.limit {
  font-weight: 700;
  white-space: nowrap;
}

/* 漲停 — red (漲) */
.limit.c-up {
  color: var(--up);
  border-color: var(--up-line);
  background: var(--up-soft);
}

/* 跌停 — green (跌) */
.limit.c-down {
  color: var(--down);
  border-color: var(--down-line);
  background: var(--down-soft);
}

.limit-lock {
  font-size: 10px;
  line-height: 1;
}
</style>
