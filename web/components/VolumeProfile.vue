<script setup lang="ts">
/**
 * Volume Profile (CT-8). Self-fetches daily candles for `symbol`, bins their
 * close prices into ~24 price buckets weighted by volume, computes the POC
 * (max-volume bucket) and a 70% Value Area (VAH/VAL), and draws a horizontal
 * histogram — price on Y, volume bars on X — with the POC bar highlighted and
 * the value-area band shaded.
 *
 * d3 is used only for the linear scale maths; bars are Vue-template SVG rects.
 * Loading / empty / error states are surfaced via StateBlock. SSR-safe: the
 * fetch runs client-only and re-runs on symbol change.
 */
import { ref, computed, watch, onMounted, type Ref } from "vue";
import { scaleLinear } from "d3-scale";
import type { Candle, ResourceStatus } from "~/types";
import { binVolumeProfile, type VolumeProfileResult } from "~/utils/viz";
import { formatPrice, formatVolume } from "~/utils/format";

const props = defineProps<{ symbol: string }>();

const BIN_COUNT = 24;
const WIDTH = 280;
const HEIGHT = 260;
const PAD = { top: 8, right: 8, bottom: 8, left: 56 };
const innerW = WIDTH - PAD.left - PAD.right;
const innerH = HEIGHT - PAD.top - PAD.bottom;

const { fetchKlines } = useApi();

const status: Ref<ResourceStatus> = ref("idle");
const profile: Ref<VolumeProfileResult> = ref({
  bins: [],
  poc: null,
  valueAreaHigh: null,
  valueAreaLow: null,
});

let requestSeq = 0;

async function load(symbol: string): Promise<void> {
  const trimmed = symbol.trim();
  const seq = ++requestSeq;

  if (trimmed.length === 0) {
    profile.value = { bins: [], poc: null, valueAreaHigh: null, valueAreaLow: null };
    status.value = "idle";
    return;
  }

  status.value = "loading";
  try {
    const candles: Candle[] = await fetchKlines(trimmed, "D");
    if (seq !== requestSeq) return; // superseded by a newer symbol
    const result = binVolumeProfile(candles, BIN_COUNT);
    profile.value = result;
    status.value = result.bins.length === 0 ? "empty" : "success";
  } catch (error) {
    if (seq !== requestSeq) return;
    console.error("VolumeProfile: load failed", error);
    profile.value = { bins: [], poc: null, valueAreaHigh: null, valueAreaLow: null };
    status.value = "error";
  }
}

watch(
  () => props.symbol,
  (next) => void load(next),
);

onMounted(() => {
  if (!import.meta.client) return;
  void load(props.symbol);
});

const maxVolume = computed<number>(() => {
  let m = 0;
  for (const b of profile.value.bins) if (b.volume > m) m = b.volume;
  return m > 0 ? m : 1;
});

const xScale = computed(() =>
  scaleLinear().domain([0, maxVolume.value]).range([0, innerW]),
);

/** Even row height across all bins (price ascends bottom→top). */
const rowHeight = computed<number>(() => {
  const n = profile.value.bins.length;
  return n > 0 ? innerH / n : innerH;
});

interface Bar {
  key: string;
  y: number;
  height: number;
  width: number;
  price: number;
  volume: number;
  isPoc: boolean;
  inValueArea: boolean;
}

const bars = computed<Bar[]>(() => {
  const { bins, poc, valueAreaHigh, valueAreaLow } = profile.value;
  const n = bins.length;
  if (n === 0) return [];
  const rh = rowHeight.value;
  const x = xScale.value;
  const barH = Math.max(1, rh - 1.5);
  // Index 0 is the lowest price → render at the bottom; highest at the top.
  return bins.map((bin, i) => {
    const y = PAD.top + (n - 1 - i) * rh;
    const inVa =
      valueAreaLow != null &&
      valueAreaHigh != null &&
      bin.price >= valueAreaLow &&
      bin.price <= valueAreaHigh;
    return {
      key: `${i}-${bin.price.toFixed(4)}`,
      y,
      height: barH,
      width: Math.max(0, x(bin.volume)),
      price: bin.price,
      volume: bin.volume,
      isPoc: poc != null && bin.price === poc,
      inValueArea: inVa,
    };
  });
});

/** Y labels at top / POC / bottom of the price range. */
const priceLabels = computed<{ y: number; price: number; kind: string }[]>(() => {
  const list = bars.value;
  if (list.length === 0) return [];
  const top = list[0]!;
  const bottom = list[list.length - 1]!;
  const out = [
    { y: top.y + top.height / 2, price: top.price, kind: "high" },
    { y: bottom.y + bottom.height / 2, price: bottom.price, kind: "low" },
  ];
  const poc = list.find((b) => b.isPoc);
  if (poc) out.push({ y: poc.y + poc.height / 2, price: poc.price, kind: "poc" });
  return out;
});

const showChart = computed<boolean>(() => status.value === "success");

const ariaLabel = computed<string>(() => {
  const p = profile.value.poc;
  return p == null
    ? `${props.symbol} 成交量分佈`
    : `${props.symbol} 成交量分佈，POC 約 ${formatPrice(p)}`;
});
</script>

<template>
  <section class="panel volume-profile">
    <div class="panel-head">
      <span class="panel-title">成交量分佈</span>
      <span v-if="profile.poc != null" class="tag vp-poc-tag mono">
        POC {{ formatPrice(profile.poc) }}
      </span>
    </div>

    <div class="panel-body vp-body">
      <StateBlock
        v-if="!showChart"
        :status="status === 'idle' ? 'loading' : status"
        @retry="() => load(props.symbol)"
      />

      <svg
        v-else
        class="vp-svg"
        :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        :aria-label="ariaLabel"
      >
        <title>{{ ariaLabel }}</title>

        <!-- Value-area band shading -->
        <template v-for="bar in bars" :key="`va-${bar.key}`">
          <rect
            v-if="bar.inValueArea"
            class="vp-va-band"
            :x="PAD.left"
            :y="bar.y"
            :width="innerW"
            :height="bar.height"
          />
        </template>

        <!-- Volume bars -->
        <rect
          v-for="bar in bars"
          :key="bar.key"
          class="vp-bar"
          :class="{ 'vp-bar-poc': bar.isPoc }"
          :x="PAD.left"
          :y="bar.y"
          :width="bar.width"
          :height="bar.height"
        >
          <title>{{ formatPrice(bar.price) }} · {{ formatVolume(bar.volume) }} 張</title>
        </rect>

        <!-- Price axis labels -->
        <text
          v-for="label in priceLabels"
          :key="`lbl-${label.kind}`"
          class="vp-axis-label mono"
          :class="{ 'vp-axis-poc': label.kind === 'poc' }"
          :x="PAD.left - 6"
          :y="label.y"
          text-anchor="end"
          dominant-baseline="middle"
        >
          {{ formatPrice(label.price) }}
        </text>
      </svg>
    </div>
  </section>
</template>

<style scoped>
.volume-profile {
  min-width: 0;
}

.vp-body {
  padding: 10px 12px;
}

/* square amber-keyed POC chip (extends shared .tag) */
.vp-poc-tag {
  color: var(--gold);
  border-color: var(--amber-soft);
  font-variant-numeric: tabular-nums;
}

.vp-svg {
  display: block;
  width: 100%;
  height: auto;
}

.vp-bar {
  fill: var(--accent-soft);
  stroke: var(--accent);
  stroke-width: 0.5;
  shape-rendering: crispEdges;
}

.vp-bar-poc {
  fill: var(--gold);
  stroke: var(--gold);
  fill-opacity: 0.85;
}

.vp-va-band {
  fill: var(--flat-soft);
}

.vp-axis-label {
  font-size: 9px;
  fill: var(--text-3);
}

.vp-axis-poc {
  fill: var(--gold);
}
</style>
