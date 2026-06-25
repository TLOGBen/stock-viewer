<script setup lang="ts">
/**
 * 估值河流圖 (ValuationRiver) — a 個股頁 估值 block. Renders PE and PB "river"
 * charts from the `/api/valuation/:symbol` envelope (ValuationView): each river
 * is five stacked quantile lanes (便宜→昂貴) drawn over the band's
 * min·p20·p40·p60·p80·max cuts, with a current-price marker placed by its zone
 * (cheap / fair / expensive).
 *
 * 估值語意 (value, not price delta): a cheap valuation is bullish → red `--up`,
 * an expensive one bearish → green `--down`, fair → flat — the site-wide 看漲=紅
 * rule applied to value. Lane shades fade up→down accordingly. No new chart
 * library: the river is a hand-rolled SVG over the pure geometry in
 * utils/valuationRiver (band → lanes + marker), so all maths is unit-tested.
 *
 * Presentational only: it takes a resource `status` + `view` and owns nothing
 * but the local PE/PB sub-tab selection. Non-success states (loading / empty /
 * error / accumulating — a band needs ≥5 real points before its quantiles mean
 * anything, REQ-010) are delegated to <StateBlock> so the panel never breaks
 * layout or draws an empty chart. Page integration happens in a later step.
 */
import { computed, ref } from "vue";
import type { ValuationView, ValuationBand, ResourceStatus } from "~/types";
import { buildRiver } from "~/utils/valuationRiver";
import { formatPrice } from "~/utils/format";

const props = defineProps<{
  /** Resource status from useValuation (never-throw wrapper). */
  status: ResourceStatus;
  /** The valuation envelope; null until loaded / on failure. */
  view?: ValuationView | null;
  /** Accumulated point count for the「歷史累積中」line (cold start). */
  n?: number | null;
}>();

const emit = defineEmits<{ retry: [] }>();

type Metric = "pe" | "pb";
const metric = ref<Metric>("pe");

/** The band for the active metric (null on cold-start / no coverage). */
const band = computed<ValuationBand | null>(() =>
  metric.value === "pe" ? props.view?.pe ?? null : props.view?.pb ?? null,
);

/** River geometry (lanes + marker) for the active band; null when no band. */
const river = computed(() => buildRiver(band.value));

/** Marker label for the current value, blank when there is no current point. */
const currentLabel = computed(() => {
  const c = river.value?.marker?.value ?? null;
  return c == null ? "" : formatPrice(c, 2);
});

/** Zone caption (便宜/合理/昂貴) for the current placement. */
const zoneLabel = computed(() => {
  const z = river.value?.marker?.zone;
  return z === "cheap" ? "便宜" : z === "expensive" ? "昂貴" : z === "fair" ? "合理" : "";
});

const metricLabel = (m: Metric): string => (m === "pe" ? "本益比 PE" : "股價淨值比 PB");
</script>

<template>
  <section class="panel valuation-river">
    <header class="panel-head">
      <span class="panel-title">估值河流</span>
      <span v-if="currentLabel" class="vr-current mono dim">
        {{ metricLabel(metric) }} {{ currentLabel }}
        <span v-if="zoneLabel" class="vr-zone" :style="{ color: river?.marker?.color }">
          {{ zoneLabel }}
        </span>
      </span>
    </header>
    <div class="panel-body">
      <StateBlock :status="props.status" :n="props.n" @retry="emit('retry')">
        <nav class="info-tabs" role="tablist" aria-label="估值指標">
          <button
            type="button"
            role="tab"
            class="info-tab"
            :class="{ active: metric === 'pe' }"
            :aria-selected="metric === 'pe'"
            @click="metric = 'pe'"
          >
            PE
          </button>
          <button
            type="button"
            role="tab"
            class="info-tab"
            :class="{ active: metric === 'pb' }"
            :aria-selected="metric === 'pb'"
            @click="metric = 'pb'"
          >
            PB
          </button>
        </nav>

        <!-- river chart: five quantile lanes + current marker, hand-rolled SVG -->
        <div v-if="river" class="vr-chart">
          <svg
            class="vr-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            :aria-label="`${metricLabel(metric)} 河流圖`"
          >
            <rect
              v-for="lane in river.lanes"
              :key="lane.key"
              x="0"
              :y="lane.yTop * 100"
              width="100"
              :height="Math.max(0, (lane.yBottom - lane.yTop) * 100)"
              :fill="lane.fill"
            />
            <line
              v-if="river.marker"
              x1="0"
              x2="100"
              :y1="river.marker.y * 100"
              :y2="river.marker.y * 100"
              :stroke="river.marker.color"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
          </svg>

          <!-- lane legend: ratio bounds per quantile lane, mono right-aligned -->
          <ul class="vr-legend">
            <li v-for="lane in river.lanes" :key="lane.key" class="vr-lane-row">
              <span class="vr-lane-swatch" :style="{ background: lane.fill }" aria-hidden="true" />
              <span class="vr-lane-name mono">{{ lane.label }}</span>
              <span class="vr-lane-range mono dim">
                {{ formatPrice(lane.from, 2) }}–{{ formatPrice(lane.to, 2) }}
              </span>
            </li>
          </ul>
        </div>
      </StateBlock>
    </div>
  </section>
</template>

<style scoped>
.valuation-river {
  display: flex;
  flex-direction: column;
}

.vr-current {
  margin-left: auto;
  font-size: 11px;
  letter-spacing: 0.04em;
  display: inline-flex;
  gap: 6px;
  align-items: baseline;
}

.vr-zone {
  font-weight: 600;
}

/* sub-tab row — mono, amber-underline active (shared terminal idiom) */
.info-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.info-tab {
  background: none;
  border: none;
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  padding: 2px 0;
  cursor: pointer;
  border-bottom: 1px solid transparent;
}

.info-tab:hover:not(.active) {
  color: var(--text);
}

.info-tab.active {
  color: var(--text);
  border-bottom-color: var(--amber);
}

.vr-chart {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--gap, 12px);
  align-items: stretch;
}

.vr-svg {
  width: 100%;
  height: 160px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-sm, 3px);
  display: block;
}

/* legend lanes ordered top (昂貴) → bottom (便宜) to mirror the river */
.vr-legend {
  display: flex;
  flex-direction: column-reverse;
  justify-content: space-between;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: 120px;
}

.vr-lane-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
}

.vr-lane-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex: 0 0 auto;
}

.vr-lane-name {
  letter-spacing: 0.06em;
  color: var(--text-2);
}

.vr-lane-range {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 640px) {
  .vr-chart {
    grid-template-columns: 1fr;
  }
  .vr-legend {
    flex-direction: row;
    flex-wrap: wrap;
    min-width: 0;
  }
  .vr-lane-range {
    margin-left: 4px;
  }
}
</style>
