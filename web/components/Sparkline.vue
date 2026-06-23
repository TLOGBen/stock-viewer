<script setup lang="ts">
import type { Direction } from "~/types";

const props = withDefaults(
  defineProps<{
    data: number[];
    direction: Direction;
    width?: number;
    height?: number;
    baseline?: number | null;
  }>(),
  {
    width: 600,
    height: 120,
    baseline: null,
  },
);

// Unique gradient id per instance so multiple sparklines don't collide.
const uid = Math.random().toString(36).slice(2, 10);
const gradientId = `spark-fill-${uid}`;

const lineColor = computed<string>(() => {
  if (props.direction === "up") return "var(--up)";
  if (props.direction === "down") return "var(--down)";
  return "var(--flat)";
});

const hasData = computed<boolean>(() => props.data.length >= 2);

/** Vertical scale: include baseline (if any) so the reference line is always in view. */
const bounds = computed<{ min: number; max: number }>(() => {
  const values = [...props.data];
  if (props.baseline != null) values.push(props.baseline);
  if (values.length === 0) return { min: 0, max: 1 };

  let min = values[0]!;
  let max = values[0]!;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    // Flat series: give it a little vertical room so the line sits mid-height.
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.01 : 1;
    return { min: min - pad, max: max + pad };
  }
  const span = max - min;
  const pad = span * 0.08;
  return { min: min - pad, max: max + pad };
});

function xAt(index: number, count: number): number {
  if (count <= 1) return props.width / 2;
  return (index / (count - 1)) * props.width;
}

function yAt(value: number): number {
  const { min, max } = bounds.value;
  const span = max - min || 1;
  const ratio = (value - min) / span;
  // Invert: higher value -> smaller y (top of the SVG).
  return props.height - ratio * props.height;
}

/** Polyline points "x,y x,y ..." for the price line. */
const linePoints = computed<string>(() => {
  const count = props.data.length;
  if (count === 0) return "";
  return props.data
    .map((value, i) => `${xAt(i, count).toFixed(2)},${yAt(value).toFixed(2)}`)
    .join(" ");
});

/** Closed path for the filled area under the line. */
const areaPath = computed<string>(() => {
  const count = props.data.length;
  if (count < 2) return "";
  const segs: string[] = [];
  props.data.forEach((value, i) => {
    const x = xAt(i, count).toFixed(2);
    const y = yAt(value).toFixed(2);
    segs.push(`${i === 0 ? "M" : "L"}${x},${y}`);
  });
  const lastX = xAt(count - 1, count).toFixed(2);
  const firstX = xAt(0, count).toFixed(2);
  segs.push(`L${lastX},${props.height.toFixed(2)}`);
  segs.push(`L${firstX},${props.height.toFixed(2)}`);
  segs.push("Z");
  return segs.join(" ");
});

const baselineY = computed<number | null>(() =>
  props.baseline == null ? null : yAt(props.baseline),
);
</script>

<template>
  <svg
    class="sparkline"
    :viewBox="`0 0 ${width} ${height}`"
    preserveAspectRatio="none"
    role="img"
    aria-label="price sparkline"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="lineColor" stop-opacity="0.32" />
        <stop offset="100%" :stop-color="lineColor" stop-opacity="0" />
      </linearGradient>
    </defs>

    <template v-if="hasData">
      <path :d="areaPath" :fill="`url(#${gradientId})`" stroke="none" />
      <line
        v-if="baselineY != null"
        class="sparkline-baseline"
        :x1="0"
        :y1="baselineY"
        :x2="width"
        :y2="baselineY"
      />
      <polyline
        class="sparkline-line"
        :points="linePoints"
        :stroke="lineColor"
        fill="none"
      />
    </template>

    <!-- Fallback: flat mid-height line when there isn't enough data to draw. -->
    <line
      v-else
      class="sparkline-empty"
      :x1="0"
      :y1="height / 2"
      :x2="width"
      :y2="height / 2"
    />
  </svg>
</template>

<style scoped>
.sparkline {
  display: block;
  width: 100%;
  height: auto;
}

.sparkline-line {
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.sparkline-baseline {
  stroke: var(--flat);
  stroke-width: 1;
  stroke-dasharray: 4 4;
  opacity: 0.6;
  vector-effect: non-scaling-stroke;
}

.sparkline-empty {
  stroke: var(--flat);
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
  opacity: 0.5;
  vector-effect: non-scaling-stroke;
}
</style>
