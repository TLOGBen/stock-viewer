<script setup lang="ts">
import type { ConnectionState } from "~/types";

const props = defineProps<{ state: ConnectionState }>();

const label = computed(() => {
  switch (props.state) {
    case "connecting":
      return "連線中";
    case "open":
      return "已連線";
    case "closed":
      return "已斷線";
    default:
      return "—";
  }
});
</script>

<template>
  <div
    class="tag conn"
    :class="`conn-${props.state}`"
    role="status"
    aria-live="polite"
    :aria-label="`連線狀態：${label}`"
  >
    <span class="dot" :class="{ pulse: props.state === 'connecting' }" />
    <span class="conn-label">{{ label }}</span>
  </div>
</template>

<style scoped>
/* squared terminal chip — inherits .tag (mono, border, surface-3) */
.conn {
  white-space: nowrap;
}

.conn-label {
  text-transform: lowercase;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: var(--text-dim);
}

/* connecting -> amber (live/pending marker) */
.conn-connecting {
  color: var(--amber);
}
.conn-connecting .dot {
  background: var(--amber);
}

/* open -> cyan/accent (已連線) */
.conn-open {
  color: var(--accent);
}
.conn-open .dot {
  background: var(--accent);
}

/* closed -> bad (已斷線) */
.conn-closed {
  color: var(--bad);
}
.conn-closed .dot {
  background: var(--bad);
}
</style>
