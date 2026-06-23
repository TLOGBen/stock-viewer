<script setup lang="ts">
/**
 * Cumulative market-depth (五檔) step-area chart (CT-7).
 *
 * Bids (買) accumulate outward from the mid and are tinted RED (--up, 漲); asks
 * (賣) accumulate outward and are tinted GREEN (--down, 跌). Price on X, summed
 * size (張) on Y. Rendered as Vue-template SVG; d3 is used only for the scale +
 * area-generator maths (curveStepAfter), so there is no direct DOM mutation and
 * the whole thing is SSR-safe.
 */
import { computed } from "vue";
import { scaleLinear } from "d3-scale";
import { area, curveStepAfter, curveStepBefore } from "d3-shape";
import type { PriceLevel } from "~/types";
import { cumulativeDepth, type DepthPoint } from "~/utils/viz";

const props = defineProps<{
  bids: PriceLevel[];
  asks: PriceLevel[];
}>();

const WIDTH = 320;
const HEIGHT = 120;
const PAD = { top: 8, right: 4, bottom: 4, left: 4 };
const innerW = WIDTH - PAD.left - PAD.right;
const innerH = HEIGHT - PAD.top - PAD.bottom;

const bidPoints = computed<DepthPoint[]>(() =>
  cumulativeDepth(props.bids ?? [], "bid"),
);
const askPoints = computed<DepthPoint[]>(() =>
  cumulativeDepth(props.asks ?? [], "ask"),
);

const hasData = computed<boolean>(
  () => bidPoints.value.length > 0 || askPoints.value.length > 0,
);

/** Mid price = halfway between best bid and best ask (or whichever side exists). */
const mid = computed<number | null>(() => {
  const bestBid = bidPoints.value[0]?.price ?? null;
  const bestAsk = askPoints.value[0]?.price ?? null;
  if (bestBid != null && bestAsk != null) return (bestBid + bestAsk) / 2;
  return bestBid ?? bestAsk;
});

/** X domain spans every quoted price across both sides. */
const xDomain = computed<[number, number]>(() => {
  const prices = [
    ...bidPoints.value.map((p) => p.price),
    ...askPoints.value.map((p) => p.price),
  ];
  if (prices.length === 0) return [0, 1];
  let lo = prices[0]!;
  let hi = prices[0]!;
  for (const p of prices) {
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  if (lo === hi) return [lo - 1, hi + 1];
  return [lo, hi];
});

/** Y domain: 0 → max cumulative depth across both sides (with a little headroom). */
const yMax = computed<number>(() => {
  const bidMax = bidPoints.value.at(-1)?.cumulative ?? 0;
  const askMax = askPoints.value.at(-1)?.cumulative ?? 0;
  const m = Math.max(bidMax, askMax);
  return m > 0 ? m * 1.08 : 1;
});

const xScale = computed(() =>
  scaleLinear().domain(xDomain.value).range([PAD.left, PAD.left + innerW]),
);
const yScale = computed(() =>
  scaleLinear()
    .domain([0, yMax.value])
    .range([PAD.top + innerH, PAD.top]),
);

/**
 * Build a closed step-area path for one side. Bids step "before" (depth holds
 * to the right toward the mid), asks step "after" — so both fill toward the mid.
 * Points are ordered low→high price so the area generator walks left→right.
 */
function buildArea(points: DepthPoint[], side: "bid" | "ask"): string {
  if (points.length === 0) return "";
  const ordered = [...points].sort((a, b) => a.price - b.price);
  const x = xScale.value;
  const y = yScale.value;
  const gen = area<DepthPoint>()
    .x((d) => x(d.price))
    .y0(y(0))
    .y1((d) => y(d.cumulative))
    .curve(side === "bid" ? curveStepBefore : curveStepAfter);
  return gen(ordered) ?? "";
}

const bidArea = computed<string>(() => buildArea(bidPoints.value, "bid"));
const askArea = computed<string>(() => buildArea(askPoints.value, "ask"));

const midX = computed<number | null>(() =>
  mid.value == null ? null : xScale.value(mid.value),
);

const ariaLabel = computed<string>(() => {
  if (!hasData.value) return "市場深度圖（無資料）";
  const midTxt = mid.value == null ? "" : `，中價約 ${mid.value.toFixed(2)}`;
  return `市場深度圖：買方紅、賣方綠的累積五檔深度${midTxt}`;
});
</script>

<template>
  <svg
    class="depth-chart"
    :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
    preserveAspectRatio="none"
    role="img"
    :aria-label="ariaLabel"
  >
    <title>{{ ariaLabel }}</title>

    <template v-if="hasData">
      <!-- Bid side (買, 紅漲) -->
      <path
        v-if="bidArea"
        class="depth-bid-fill"
        :d="bidArea"
        :stroke="'var(--up-line)'"
      />
      <!-- Ask side (賣, 綠跌) -->
      <path
        v-if="askArea"
        class="depth-ask-fill"
        :d="askArea"
        :stroke="'var(--down-line)'"
      />
      <!-- Mid-price marker -->
      <line
        v-if="midX != null"
        class="depth-mid"
        :x1="midX"
        :y1="PAD.top"
        :x2="midX"
        :y2="PAD.top + innerH"
      />
    </template>

    <line
      v-else
      class="depth-empty"
      :x1="PAD.left"
      :y1="HEIGHT / 2"
      :x2="WIDTH - PAD.right"
      :y2="HEIGHT / 2"
    />
  </svg>
</template>

<style scoped>
.depth-chart {
  display: block;
  width: 100%;
  height: auto;
}

.depth-bid-fill {
  fill: var(--up-soft);
  stroke-width: 1.5;
  stroke-linejoin: miter;
  stroke-linecap: butt;
  vector-effect: non-scaling-stroke;
}

.depth-ask-fill {
  fill: var(--down-soft);
  stroke-width: 1.5;
  stroke-linejoin: miter;
  stroke-linecap: butt;
  vector-effect: non-scaling-stroke;
}

.depth-mid {
  stroke: var(--flat);
  stroke-width: 1;
  stroke-dasharray: 3 3;
  opacity: 0.7;
  vector-effect: non-scaling-stroke;
}

.depth-empty {
  stroke: var(--flat);
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
  opacity: 0.5;
  vector-effect: non-scaling-stroke;
}
</style>
