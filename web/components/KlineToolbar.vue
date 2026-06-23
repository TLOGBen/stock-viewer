<script setup lang="ts">
import type { KlineInterval, KlineChartType } from "~/types";

/**
 * Chart toolbar: interval (1分/5分/15分/日/週/月) segmented buttons + a
 * compact chart-type segmented control (K線/空心/折線/面積/美國線/平均足)
 * + a fullscreen toggle. Both selections are two-way bound via v-model.
 */
const interval = defineModel<KlineInterval>("interval", { required: true });
const chartType = defineModel<KlineChartType>("chartType", { required: true });

const emit = defineEmits<{ "toggle-fullscreen": [] }>();

const INTERVALS: { value: KlineInterval; label: string }[] = [
  { value: "1m", label: "1分" },
  { value: "5m", label: "5分" },
  { value: "15m", label: "15分" },
  { value: "D", label: "日" },
  { value: "W", label: "週" },
  { value: "M", label: "月" },
];

const CHART_TYPES: { value: KlineChartType; label: string }[] = [
  { value: "candle_solid", label: "K線" },
  { value: "candle_stroke", label: "空心" },
  { value: "line", label: "折線" },
  { value: "area", label: "面積" },
  { value: "ohlc", label: "美國線" },
  { value: "heikin_ashi", label: "平均足" },
];

function selectInterval(value: KlineInterval): void {
  interval.value = value;
}
function selectChartType(value: KlineChartType): void {
  chartType.value = value;
}
</script>

<template>
  <div class="kt">
    <div class="kt-group" role="group" aria-label="時間週期">
      <button
        v-for="iv in INTERVALS"
        :key="iv.value"
        type="button"
        class="kt-btn"
        :class="{ active: interval === iv.value }"
        :aria-pressed="interval === iv.value"
        @click="selectInterval(iv.value)"
      >
        {{ iv.label }}
      </button>
    </div>

    <div class="kt-spacer" />

    <div class="kt-group" role="group" aria-label="圖表類型">
      <button
        v-for="ct in CHART_TYPES"
        :key="ct.value"
        type="button"
        class="kt-btn"
        :class="{ active: chartType === ct.value }"
        :aria-pressed="chartType === ct.value"
        @click="selectChartType(ct.value)"
      >
        {{ ct.label }}
      </button>
    </div>

    <button
      type="button"
      class="btn btn-ghost kt-full"
      aria-label="全螢幕切換"
      title="全螢幕"
      @click="emit('toggle-fullscreen')"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
        <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
        <path d="M3 16v3a2 2 0 0 0 2 2h3" />
        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.kt {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--gap-sm);
}

.kt-spacer {
  flex: 1 1 auto;
  min-width: 0;
}

/* segmented control — hairline-framed, buttons abut with hairline dividers */
.kt-group {
  display: inline-flex;
  align-items: stretch;
  background: var(--bg-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.kt-group .kt-btn {
  border-radius: 0;
  border: none;
  border-left: 1px solid var(--hairline);
}
.kt-group .kt-btn:first-child {
  border-left: none;
}

/* squared mono segment — uppercase-tracked terminal control */
.kt-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 11px;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  line-height: 1;
  color: var(--text-3);
  background: transparent;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  transition:
    color 0.12s ease,
    background 0.12s ease,
    box-shadow 0.12s ease;
}

.kt-btn:hover {
  color: var(--text);
  background: var(--surface-2);
}

.kt-btn:focus-visible {
  outline: none;
  box-shadow: var(--accent-soft) 0 0 0 2px;
  position: relative;
  z-index: 1;
}

/* selected segment — cyan text/bg/border */
.kt-btn.active {
  color: var(--accent);
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px var(--accent-line);
}

/* fullscreen — ghost icon button */
.kt-full {
  flex: none;
  width: 32px;
  height: 30px;
  padding: 0;
}
</style>
