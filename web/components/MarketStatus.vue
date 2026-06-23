<script setup lang="ts">
import type { MarketStatus } from "~/types";

const props = defineProps<{ market: MarketStatus | null }>();

const session = computed(() => props.market?.session ?? null);
const label = computed(() => props.market?.label ?? "—");
</script>

<template>
  <div class="tag market" :class="session ? `market-${session}` : 'market-none'">
    <span class="dot" />
    <span class="market-label">{{ label }}</span>
  </div>
</template>

<style scoped>
/* squared terminal chip — inherits .tag (mono, border, surface-3) */
.market {
  white-space: nowrap;
}

.market-label {
  text-transform: lowercase;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: var(--text-dim);
}

/* open -> cyan/accent (NOT red/green, to avoid price-color confusion) */
.market-open {
  color: var(--accent);
}
.market-open .dot {
  background: var(--accent);
}

/* pre -> amber (session marker) */
.market-pre {
  color: var(--amber);
}
.market-pre .dot {
  background: var(--amber);
}

/* closed -> dim */
.market-closed,
.market-none {
  color: var(--text-3);
}
.market-closed .dot,
.market-none .dot {
  background: var(--text-dim);
}
</style>
