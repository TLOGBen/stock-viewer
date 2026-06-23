<script setup lang="ts">
import type { IndicatorSpec } from "~/types";

/**
 * Toggle common KLineChart indicators on/off. Bound to a v-model array of
 * IndicatorSpec. Each known indicator carries its overlay/sub-pane placement
 * and sensible default calcParams so toggling it on yields a usable instance.
 */
const indicators = defineModel<IndicatorSpec[]>("indicators", {
  required: true,
});

/** Catalogue of selectable indicators with default placement + params. */
const CATALOG: { spec: IndicatorSpec; label: string }[] = [
  {
    label: "MA",
    spec: { name: "MA", isOverlay: true, calcParams: [5, 10, 20] },
  },
  {
    label: "EMA",
    spec: { name: "EMA", isOverlay: true, calcParams: [6, 12, 20] },
  },
  {
    label: "BOLL",
    spec: { name: "BOLL", isOverlay: true, calcParams: [20, 2] },
  },
  { label: "VOL", spec: { name: "VOL", isOverlay: false } },
  {
    label: "MACD",
    spec: { name: "MACD", isOverlay: false, calcParams: [12, 26, 9] },
  },
  {
    label: "RSI",
    spec: { name: "RSI", isOverlay: false, calcParams: [6, 12, 24] },
  },
  {
    label: "KDJ",
    spec: { name: "KDJ", isOverlay: false, calcParams: [9, 3, 3] },
  },
];

const OVERLAY = CATALOG.filter((c) => c.spec.isOverlay);
const SUBPANE = CATALOG.filter((c) => !c.spec.isOverlay);

function isActive(name: string): boolean {
  return indicators.value.some((i) => i.name === name);
}

/** Toggle an indicator immutably — append its spec or filter it out. */
function toggle(spec: IndicatorSpec): void {
  if (isActive(spec.name)) {
    indicators.value = indicators.value.filter((i) => i.name !== spec.name);
  } else {
    indicators.value = [...indicators.value, { ...spec }];
  }
}
</script>

<template>
  <div class="ip">
    <div class="ip-row" role="group" aria-label="主圖指標">
      <span class="ip-label label">主圖</span>
      <button
        v-for="c in OVERLAY"
        :key="c.spec.name"
        type="button"
        class="ip-tag"
        :class="{ active: isActive(c.spec.name) }"
        :aria-pressed="isActive(c.spec.name)"
        @click="toggle(c.spec)"
      >
        {{ c.label }}
      </button>
    </div>

    <div class="ip-row" role="group" aria-label="副圖指標">
      <span class="ip-label label">副圖</span>
      <button
        v-for="c in SUBPANE"
        :key="c.spec.name"
        type="button"
        class="ip-tag"
        :class="{ active: isActive(c.spec.name) }"
        :aria-pressed="isActive(c.spec.name)"
        @click="toggle(c.spec)"
      >
        {{ c.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.ip {
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
}

.ip-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--gap-sm);
}

/* leading terminal label (mono uppercase tracked via .label) */
.ip-label {
  min-width: 2.6em;
}

/* squared mono indicator chip — not a pill */
.ip-tag {
  appearance: none;
  display: inline-flex;
  align-items: center;
  padding: 4px 11px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--text-3);
  background: var(--surface-3);
  border: 1px solid var(--hairline);
  transition:
    color 0.12s ease,
    background 0.12s ease,
    border-color 0.12s ease,
    box-shadow 0.12s ease;
}

.ip-tag:hover {
  color: var(--text);
  background: var(--surface-2);
  border-color: var(--border-strong);
}

.ip-tag:focus-visible {
  outline: none;
  box-shadow: var(--accent-soft) 0 0 0 2px;
}

/* selected indicator — cyan text/bg/border */
.ip-tag.active {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent-line);
}
</style>
