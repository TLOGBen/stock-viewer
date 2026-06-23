<script setup lang="ts">
/**
 * Small freshness indicator: a dot + label (即時 / 延遲 / 收盤 / 斷線) plus an
 * optional as-of HH:MM:SS. Uses --ok/--accent for live, --warn gold for stale,
 * --text-3 for closed, --bad for disconnected — deliberately NOT the price
 * red/green palette, to avoid confusion with 漲跌 colours.
 */
import { computed } from "vue";
import { formatTime } from "~/utils/format";

type FreshnessState = "live" | "stale" | "closed" | "disconnected";

const props = defineProps<{
  state: FreshnessState;
  asOf?: number;
}>();

const label = computed(() => {
  switch (props.state) {
    case "live":
      return "即時";
    case "stale":
      return "延遲";
    case "closed":
      return "收盤";
    case "disconnected":
      return "斷線";
    default:
      return "—";
  }
});

const asOfText = computed(() =>
  props.asOf !== undefined && Number.isFinite(props.asOf) ? formatTime(props.asOf) : null,
);
</script>

<template>
  <div
    class="tag fresh"
    :class="`fresh-${props.state}`"
    role="status"
    aria-live="polite"
    :aria-label="asOfText ? `${label}，更新於 ${asOfText}` : label"
  >
    <span class="dot" :class="{ pulse: props.state === 'live' }" />
    <span class="fresh-label">{{ label }}</span>
    <span v-if="asOfText" class="fresh-asof mono">{{ asOfText }}</span>
  </div>
</template>

<style scoped>
/* squared terminal chip — inherits .tag (mono, border, surface-3) */
.fresh {
  white-space: nowrap;
}

.fresh-label {
  text-transform: lowercase;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: none;
  background: var(--text-dim);
}

.fresh-asof {
  color: var(--text-3);
}

/* live -> cyan/accent (NOT green); amber dot = live signal */
.fresh-live {
  color: var(--accent);
}
.fresh-live .dot {
  background: var(--live);
}

/* stale -> amber/warn */
.fresh-stale {
  color: var(--warn);
}
.fresh-stale .dot {
  background: var(--warn);
}

/* closed -> dim */
.fresh-closed {
  color: var(--text-3);
}
.fresh-closed .dot {
  background: var(--text-dim);
}

/* disconnected -> bad */
.fresh-disconnected {
  color: var(--bad);
}
.fresh-disconnected .dot {
  background: var(--bad);
}

.pulse {
  animation: fresh-pulse 1.6s ease-in-out infinite;
}

@keyframes fresh-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pulse {
    animation: none;
  }
}
</style>
