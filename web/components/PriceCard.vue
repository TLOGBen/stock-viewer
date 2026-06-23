<script setup lang="ts">
import type { Quote } from "~/types";

const props = defineProps<{ quote: Quote; active: boolean }>();
const emit = defineEmits<{ (e: "select", symbol: string): void }>();

const md = useMarketData();
const { freshnessOf } = useFreshness();

// Desaturate the card when its quote's feed is stale (PQ-2 / PQ-6).
const isStale = computed(
  () => freshnessOf(props.quote, md.market.value) === "stale",
);

// 漲停 / 跌停 lock badge for this card's quote (QM-6); null hides it.
const limitState = computed(() => limitStateOf(props.quote));

const flash = ref<"" | "flash-up" | "flash-down">("");
let flashTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.quote.updatedAt,
  () => {
    const t = props.quote.tick;
    if (t !== "up" && t !== "down") return;
    if (flashTimer) clearTimeout(flashTimer);
    flash.value = t === "up" ? "flash-up" : "flash-down";
    flashTimer = setTimeout(() => {
      flash.value = "";
      flashTimer = null;
    }, 550);
  },
);

onBeforeUnmount(() => {
  if (flashTimer) clearTimeout(flashTimer);
});

function onSelect(): void {
  emit("select", props.quote.symbol);
}
</script>

<template>
  <button
    type="button"
    class="card"
    :class="[flash, { active: props.active, stale: isStale }]"
    @click="onSelect"
  >
    <div class="head">
      <span class="symbol mono">{{ props.quote.symbol }}</span>
      <span class="name">{{ props.quote.name }}</span>
      <LimitBadge :state="limitState" />
    </div>

    <div class="price-row">
      <span class="price mono" :class="signClass(props.quote.direction)">
        {{ formatPrice(props.quote.price) }}
      </span>
      <span class="arrow" :class="signClass(props.quote.direction)">
        {{ arrow(props.quote.direction) }}
      </span>
    </div>

    <div class="change-row mono" :class="signClass(props.quote.direction)">
      <span>{{ formatChange(props.quote.change) }}</span>
      <span>{{ formatPercent(props.quote.changePercent) }}</span>
    </div>

    <div class="vol-row">
      <span class="vol-label">量</span>
      <span class="vol mono">{{ formatVolume(props.quote.volume) }}</span>
    </div>
  </button>
</template>

<style scoped>
/* Compact terminal tile: sharp hairline frame, amber left-bar on select. */
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
  width: 100%;
  text-align: left;
  padding: 9px 11px 9px 12px;
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-sm);
  color: var(--text);
  transition:
    border-color 0.12s ease,
    background-color 0.12s ease;
}

.card:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

/* selected → amber 3px left rail + amber frame (was cyan) */
.card.active {
  border-color: var(--amber);
  background: var(--surface-2);
}
.card.active::before {
  content: "";
  position: absolute;
  top: -1px;
  bottom: -1px;
  left: -1px;
  width: 3px;
  background: var(--amber);
}

.card.stale {
  opacity: 0.55;
}

.head {
  display: flex;
  align-items: baseline;
  gap: var(--gap-sm);
  min-width: 0;
}

.symbol {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text);
}

.name {
  font-size: 11.5px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.price {
  font-size: 21px;
  font-weight: 700;
  line-height: 1;
}

.arrow {
  font-size: 12px;
}

.change-row {
  display: flex;
  gap: 10px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.vol-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 10.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.vol-label {
  font-family: var(--font-mono);
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

.vol {
  color: var(--text-2);
}
</style>
