<script setup lang="ts">
/**
 * Market Heatmap (QM-10). Builds HeatmapNode[] from the live quotes singleton
 * (weight = turnover proxy = volume × price; changePercent from the quote) and
 * lays them out with a d3-hierarchy squarified treemap. Cell size encodes
 * turnover; cell fill is a diverging red(漲)/green(跌) ramp around 0 (--up for
 * positive, --down for negative, --flat near zero); each cell is labelled with
 * its symbol + change%.
 *
 * d3 is used only for the treemap maths (treemapSquarify); cells are Vue SVG
 * rects. Responsive width via a ResizeObserver (client-only, SSR-safe), with a
 * fixed viewBox aspect so it scales cleanly before the observer fires.
 */
import { ref, computed, onMounted, onBeforeUnmount, type Ref } from "vue";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import type { HeatmapNode, Quote } from "~/types";
import { changeColor, changeIntensity } from "~/utils/viz";
import { formatPercent } from "~/utils/format";

const { quotes } = useMarketData();

const VIEW_W = 800;
const VIEW_H = 460;

const containerRef: Ref<HTMLElement | null> = ref(null);
const width = ref(VIEW_W);
const height = computed(() => Math.round((width.value * VIEW_H) / VIEW_W));

let observer: ResizeObserver | null = null;

onMounted(() => {
  if (!import.meta.client) return;
  const el = containerRef.value;
  if (!el || typeof ResizeObserver === "undefined") return;
  observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const w = entry.contentRect.width;
    if (w > 0) width.value = w;
  });
  observer.observe(el);
});

onBeforeUnmount(() => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
});

/** Live quotes → HeatmapNode[] (turnover weight, drop zero-turnover symbols). */
const nodes = computed<HeatmapNode[]>(() => {
  const out: HeatmapNode[] = [];
  for (const q of Object.values(quotes.value) as Quote[]) {
    const price = q.price ?? q.prevClose;
    const weight = q.volume * price;
    if (!Number.isFinite(weight) || weight <= 0) continue;
    out.push({
      symbol: q.symbol,
      name: q.name,
      weight,
      changePercent: q.changePercent,
    });
  }
  return out;
});

const hasData = computed<boolean>(() => nodes.value.length > 0);

interface Cell {
  symbol: string;
  name: string;
  changePercent: number;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  fillOpacity: number;
  showLabel: boolean;
}

/** Treemap datum: the synthetic root holds children; leaves are HeatmapNodes. */
type TreeDatum = { children: HeatmapNode[] } | HeatmapNode;

const cells = computed<Cell[]>(() => {
  const data = nodes.value;
  if (data.length === 0) return [];

  const root = hierarchy<TreeDatum>({ children: data })
    .sum((d) => ("weight" in d ? d.weight : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  // treemap() returns the same node typed as a rectangular node (x0/y0/x1/y1).
  const rect = treemap<TreeDatum>()
    .tile(treemapSquarify)
    .size([VIEW_W, VIEW_H])
    .paddingInner(2)
    .round(true)(root);

  return rect.leaves().map((leaf) => {
    const datum = leaf.data as HeatmapNode;
    const w = Math.max(0, leaf.x1 - leaf.x0);
    const h = Math.max(0, leaf.y1 - leaf.y0);
    return {
      symbol: datum.symbol,
      name: datum.name,
      changePercent: datum.changePercent,
      x: leaf.x0,
      y: leaf.y0,
      w,
      h,
      fill: changeColor(datum.changePercent),
      // Stronger move → more saturated cell (floor so a flat cell stays visible).
      fillOpacity: 0.22 + 0.55 * changeIntensity(datum.changePercent),
      showLabel: w > 46 && h > 26,
    };
  });
});

const ariaLabel = computed<string>(() =>
  hasData.value
    ? `類股熱力圖：${cells.value.length} 檔依成交值大小排列，紅漲綠跌`
    : "類股熱力圖（無資料）",
);
</script>

<template>
  <section class="panel heatmap">
    <div class="panel-head">
      <span class="panel-title">類股熱力圖</span>
      <span class="hm-legend mono">
        <span class="hm-swatch hm-up" aria-hidden="true" />漲
        <span class="hm-swatch hm-down" aria-hidden="true" />跌
      </span>
    </div>

    <div ref="containerRef" class="panel-body hm-body">
      <StateBlock v-if="!hasData" status="empty" message="尚無行情" />

      <svg
        v-else
        class="hm-svg"
        :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        :aria-label="ariaLabel"
      >
        <title>{{ ariaLabel }}</title>

        <g v-for="cell in cells" :key="cell.symbol">
          <rect
            class="hm-cell"
            :x="cell.x"
            :y="cell.y"
            :width="cell.w"
            :height="cell.h"
            :fill="cell.fill"
            :fill-opacity="cell.fillOpacity"
          >
            <title>
              {{ cell.symbol }} {{ cell.name }} · {{ formatPercent(cell.changePercent) }}
            </title>
          </rect>

          <template v-if="cell.showLabel">
            <text
              class="hm-symbol"
              :x="cell.x + 5"
              :y="cell.y + 14"
            >
              {{ cell.symbol }}
            </text>
            <text
              class="hm-change mono"
              :x="cell.x + 5"
              :y="cell.y + 27"
            >
              {{ formatPercent(cell.changePercent) }}
            </text>
          </template>
        </g>
      </svg>
    </div>
  </section>
</template>

<style scoped>
.heatmap {
  min-width: 0;
}

.hm-body {
  padding: var(--gap-sm);
}

.hm-svg {
  display: block;
  width: 100%;
  height: auto;
}

.hm-cell {
  stroke: var(--bg);
  stroke-width: 1;
  shape-rendering: crispEdges;
}

/* White text + a strong dark halo so labels stay legible (WCAG AA) over any
   saturated cell color — independent of the red/green cell fill. */
.hm-symbol {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  fill: #ffffff;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.85);
  stroke-width: 2.5;
  pointer-events: none;
}

.hm-change {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  fill: #ffffff;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.85);
  stroke-width: 2.5;
  pointer-events: none;
}

.hm-legend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--text-3);
}

/* square hairline-edged swatches — terminal, not pill */
.hm-swatch {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 0;
  margin-left: 8px;
}

.hm-swatch.hm-up {
  background: var(--up);
}

.hm-swatch.hm-down {
  background: var(--down);
}
</style>
