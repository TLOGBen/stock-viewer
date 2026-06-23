<script setup lang="ts">
import type { Tick, Quote } from "~/types";

const { recentTicks, selected, quotes } = useMarketData();

const selectedName = computed<string>(() => {
  const sym = selected.value;
  if (!sym) return "";
  const quote: Quote | undefined = quotes.value[sym];
  return quote?.name ?? sym;
});

const ticks = computed<Tick[]>(() => recentTicks.value);
</script>

<template>
  <section class="ticktape panel">
    <header class="panel-head">
      <span class="panel-title">成交明細</span>
      <span v-if="selectedName" class="tt-sym mono">{{ selectedName }}</span>
    </header>

    <div class="tt-body">
      <transition-group v-if="ticks.length > 0" name="tt" tag="ul" class="tt-list">
        <li v-for="t in ticks" :key="t.id" class="tt-row">
          <span class="tt-time mono">{{ t.time }}</span>
          <span class="tt-price mono" :class="signClass(t.direction)">
            {{ arrow(t.direction) }} {{ formatPrice(t.price) }}
          </span>
          <span class="tt-size mono">{{ formatInt(t.size) }}</span>
        </li>
      </transition-group>

      <div v-else class="tt-empty empty">等待成交…</div>
    </div>
  </section>
</template>

<style scoped>
.ticktape {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* selected symbol — muted mono tag aligned to the panel head */
.tt-sym {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--text-3);
}

.tt-body {
  flex: 1;
  min-height: 0;
  max-height: 320px;
  overflow-y: auto;
}

.tt-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

/* hairline-separated terminal ticker row — no rounding, no zebra fill */
.tt-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 5px 11px;
  font-size: 12.5px;
  border-bottom: 1px solid var(--grid-line);
}

.tt-row:last-child {
  border-bottom: none;
}

.tt-time {
  color: var(--text-3);
  font-size: 11.5px;
}

.tt-price {
  text-align: right;
  font-weight: 600;
}

.tt-size {
  text-align: right;
  color: var(--text-2);
}

/* new-row transition (newest unshifted at top) */
.tt-enter-active {
  transition:
    transform 0.25s ease-out,
    opacity 0.25s ease-out;
}
.tt-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.tt-move {
  transition: transform 0.25s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .tt-enter-active,
  .tt-move {
    transition: none;
  }
}
</style>
