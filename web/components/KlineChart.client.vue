<script setup lang="ts">
/**
 * Client-only KLineChart wrapper. Owns the chart lifecycle:
 *
 * - onMounted: dynamic-import klinecharts, init on a template-ref div, apply the
 *   theme + initial data + indicators, wire a ResizeObserver.
 * - watch: candles (applyNewData on bulk reloads, updateData on live forming-bar
 *   folds; HA-transformed when chartType is heikin_ashi), chartType (setStyles
 *   candle.type), indicators (diff → create/remove). useKlines already folds the
 *   live lastCandle event into its candles ref, so this component reacts to that
 *   single source of truth rather than watching lastCandle itself.
 * - onBeforeUnmount: dispose chart + disconnect observer.
 *
 * Every KLineChart call is guarded — `chart` is null until the async init lands.
 */
import { ref, watch, onMounted, onBeforeUnmount, toRef } from "vue";
import type { Candle, KlineInterval, KlineChartType, IndicatorSpec } from "~/types";
import { themeToKlineStyles } from "~/utils/klineTheme";
import {
  toHeikinAshi,
  chartTypeToCandleType,
  isLineMode,
} from "~/utils/klineTransform";

// klinecharts' Chart type isn't imported statically (the lib is dynamically
// imported to stay out of the SSR bundle); a structural alias keeps us typed.
type KLineChartInstance = {
  applyNewData: (data: Candle[]) => void;
  updateData: (data: Candle) => void;
  setStyles: (styles: Record<string, unknown>) => void;
  createIndicator: (
    value: string | Record<string, unknown>,
    isStack?: boolean,
    paneOptions?: { id?: string },
  ) => string | null;
  removeIndicator: (paneId: string, name?: string) => void;
  resize: () => void;
};
type KLineModule = {
  init: (el: HTMLElement) => KLineChartInstance | null;
  dispose: (el: HTMLElement) => void;
};

const props = defineProps<{
  symbol: string;
  interval: KlineInterval;
  chartType: KlineChartType;
  indicators: IndicatorSpec[];
}>();

const CANDLE_PANE_ID = "candle_pane";

const containerRef = ref<HTMLDivElement | null>(null);
let chart: KLineChartInstance | null = null;
let klineModule: KLineModule | null = null;
let resizeObserver: ResizeObserver | null = null;
// Tracks live indicators: name → paneId (overlay items live on the candle pane).
const indicatorPanes = new Map<string, string>();

const symbolRef = toRef(props, "symbol");
const intervalRef = toRef(props, "interval");
const { candles } = useKlines(symbolRef, intervalRef);

/** Apply chartType: HA transforms the data, "line" hides the area fill. */
function dataForChart(): Candle[] {
  return props.chartType === "heikin_ashi"
    ? toHeikinAshi(candles.value)
    : candles.value;
}

// Snapshot of the previous candle series, used by the candles watcher to classify
// each change: a *bulk* change (re-fetch / symbol / interval switch) reapplies the
// whole dataset, while a single live fold (append a new bar or replace the forming
// last bar) is mirrored incrementally via updateData — avoiding a heavy
// applyNewData on every tick.
let prevCandles: readonly Candle[] = [];

/** Push the full candle set to the chart (guarded). */
function pushData(): void {
  if (!chart) return;
  chart.applyNewData(dataForChart());
  prevCandles = candles.value;
}

/** Apply the candle.type for the current chartType (+ line-mode fill removal). */
function applyChartType(): void {
  if (!chart) return;
  const type = chartTypeToCandleType(props.chartType);
  const styles: Record<string, unknown> = {
    candle: {
      type,
      // For pseudo-"line" mode, drop the area fill so only the line shows.
      ...(isLineMode(props.chartType)
        ? { area: { backgroundColor: "rgba(0,0,0,0)" } }
        : {}),
    },
  };
  chart.setStyles(styles);
}

/** Reconcile the chart's indicators with `props.indicators` (create/remove diff). */
function syncIndicators(specs: IndicatorSpec[]): void {
  if (!chart) return;
  const wanted = new Set(specs.map((s) => s.name));

  // Remove indicators no longer requested.
  for (const [name, paneId] of [...indicatorPanes.entries()]) {
    if (!wanted.has(name)) {
      chart.removeIndicator(paneId, name);
      indicatorPanes.delete(name);
    }
  }

  // Create newly requested indicators.
  for (const spec of specs) {
    if (indicatorPanes.has(spec.name)) continue;
    const create: Record<string, unknown> = { name: spec.name };
    if (spec.calcParams && spec.calcParams.length > 0) {
      create.calcParams = spec.calcParams;
    }
    if (spec.isOverlay) {
      // Stack on the main candle pane.
      chart.createIndicator(create, true, { id: CANDLE_PANE_ID });
      indicatorPanes.set(spec.name, CANDLE_PANE_ID);
    } else {
      // Own sub-pane; KLineChart returns the generated pane id.
      const paneId = chart.createIndicator(create, false);
      indicatorPanes.set(spec.name, paneId ?? spec.name);
    }
  }
}

onMounted(async () => {
  const el = containerRef.value;
  if (!el) return;

  try {
    const mod = (await import("klinecharts")) as unknown as KLineModule;
    klineModule = mod;
    const instance = mod.init(el);
    if (!instance) {
      console.error("KlineChart: init returned null");
      return;
    }
    chart = instance;
  } catch (error) {
    console.error("KlineChart: failed to init klinecharts", error);
    return;
  }

  chart.setStyles(themeToKlineStyles());
  applyChartType();
  pushData();
  syncIndicators(props.indicators);

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      if (chart) chart.resize();
    });
    resizeObserver.observe(el);
  }
});

/**
 * Classify the transition from `prev` to `next`:
 *  - "append"  : exactly one new bar at the end, prefix unchanged → live new bar
 *  - "replace" : same length, only the last bar changed (forming bar update)
 *  - "bulk"    : anything else (re-fetch, symbol/interval switch, empty)
 */
function classifyChange(
  prev: readonly Candle[],
  next: readonly Candle[],
): "append" | "replace" | "bulk" {
  if (prev.length === 0 || next.length === 0) return "bulk";
  const prevLast = prev[prev.length - 1];
  const nextLast = next[next.length - 1];
  if (prevLast === undefined || nextLast === undefined) return "bulk";

  if (next.length === prev.length) {
    // Forming-bar replace: only the last bar may differ, same trailing timestamp.
    if (nextLast.timestamp === prevLast.timestamp) {
      const nextPrevTail = next[next.length - 2];
      const prevPrevTail = prev[prev.length - 2];
      if (nextPrevTail?.timestamp === prevPrevTail?.timestamp) return "replace";
    }
    return "bulk";
  }

  if (next.length === prev.length + 1) {
    // New bar appended: the old last bar must still sit at index length-2.
    const carried = next[next.length - 2];
    if (
      carried?.timestamp === prevLast.timestamp &&
      nextLast.timestamp > prevLast.timestamp
    ) {
      return "append";
    }
  }

  return "bulk";
}

// Candles changed → push the whole set on bulk changes, mirror live folds via
// updateData (HA mode re-derives the full HA series so the open/close chain holds).
watch(candles, (next) => {
  if (!chart) return;
  const kind = classifyChange(prevCandles, next);
  if (kind === "bulk" || props.chartType === "heikin_ashi") {
    pushData();
    return;
  }
  const liveBar = next[next.length - 1];
  if (liveBar !== undefined) chart.updateData(liveBar);
  prevCandles = next;
});

// Chart type changed → restyle candle.type (+ re-push for HA data swap).
watch(
  () => props.chartType,
  () => {
    applyChartType();
    pushData();
  },
);

// Indicator set changed → diff create/remove.
watch(
  () => props.indicators,
  (specs) => {
    syncIndicators(specs);
  },
  { deep: true },
);

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  const el = containerRef.value;
  if (klineModule && el) {
    try {
      klineModule.dispose(el);
    } catch (error) {
      console.error("KlineChart: dispose failed", error);
    }
  }
  chart = null;
  klineModule = null;
  indicatorPanes.clear();
});
</script>

<template>
  <div ref="containerRef" class="kline-chart" />
</template>

<style scoped>
.kline-chart {
  width: 100%;
  height: 360px;
  min-height: 240px;
}
</style>
