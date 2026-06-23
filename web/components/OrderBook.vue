<script setup lang="ts">
import type { Quote, PriceLevel } from "~/types";

const md = useMarketData();
const q = md.selectedQuote;

/** Reverse asks so the best ask (lowest price = asks[0]) sits closest to the spread. */
const asksDesc = computed<PriceLevel[]>(() => {
  const quote = q.value;
  if (!quote) return [];
  // asks come ascending (asks[0] = lowest/best); display descending → best at bottom of ask block.
  return [...quote.asks].reverse();
});

/** Bids stay descending (best bid = bids[0] at top of the bid block). */
const bidsDesc = computed<PriceLevel[]>(() => {
  const quote = q.value;
  if (!quote) return [];
  return [...quote.bids];
});

/** Max size across all shown levels, for depth-bar width %. */
const maxSize = computed<number>(() => {
  const quote = q.value;
  if (!quote) return 0;
  let max = 0;
  for (const lvl of quote.asks) if (lvl.size > max) max = lvl.size;
  for (const lvl of quote.bids) if (lvl.size > max) max = lvl.size;
  return max;
});

function depthPct(size: number): number {
  const max = maxSize.value;
  if (max <= 0) return 0;
  return Math.min(100, (size / max) * 100);
}

const spreadDir = computed(() => q.value?.direction ?? "flat");
</script>

<template>
  <section class="orderbook panel">
    <header class="panel-head">
      <span class="panel-title">五檔</span>
    </header>

    <div v-if="q" class="ob-body" role="table" aria-label="五檔報價">
      <!-- ASK side (賣) — green, price descending, best ask just above spread -->
      <div class="ob-side ask-side" role="rowgroup" aria-label="賣方五檔">
        <div
          v-for="(lvl, i) in asksDesc"
          :key="`a-${i}-${lvl.price}`"
          class="ob-row"
          role="row"
          :aria-label="`賣 ${formatPriceBanded(lvl.price)} 元，${formatInt(lvl.size)} 張`"
        >
          <div
            class="depth-bar depth-bar--ask"
            :style="{ width: depthPct(lvl.size) + '%' }"
          />
          <span class="ob-price mono c-down" role="cell">{{ formatPriceBanded(lvl.price) }}</span>
          <span class="ob-size mono num" role="cell">{{ formatInt(lvl.size) }}</span>
        </div>
        <div v-if="asksDesc.length === 0" class="ob-empty">無賣單</div>
      </div>

      <!-- spread row: 成交 + 漲跌幅 -->
      <div
        class="ob-spread"
        :class="signClass(spreadDir)"
        role="row"
        :aria-label="`成交 ${formatPriceBanded(q.price)} 元，${formatPercent(q.changePercent)}`"
      >
        <span class="spread-label">成交</span>
        <span class="spread-price mono num">{{ formatPriceBanded(q.price) }}</span>
        <span class="spread-pct mono num"
          >{{ arrow(spreadDir) }} {{ formatPercent(q.changePercent) }}</span
        >
      </div>

      <!-- BID side (買) — red, price descending, best bid at top -->
      <div class="ob-side bid-side" role="rowgroup" aria-label="買方五檔">
        <div
          v-for="(lvl, i) in bidsDesc"
          :key="`b-${i}-${lvl.price}`"
          class="ob-row"
          role="row"
          :aria-label="`買 ${formatPriceBanded(lvl.price)} 元，${formatInt(lvl.size)} 張`"
        >
          <div
            class="depth-bar depth-bar--bid"
            :style="{ width: depthPct(lvl.size) + '%' }"
          />
          <span class="ob-price mono c-up" role="cell">{{ formatPriceBanded(lvl.price) }}</span>
          <span class="ob-size mono num" role="cell">{{ formatInt(lvl.size) }}</span>
        </div>
        <div v-if="bidsDesc.length === 0" class="ob-empty">無買單</div>
      </div>
    </div>

    <div v-else class="ob-empty ob-placeholder">尚無報價</div>
  </section>
</template>

<style scoped>
.orderbook {
  min-height: 0;
}

/* Dense ladder body — hairline separated, no rounded rows. */
.ob-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 2px 0;
}

.ob-side {
  display: flex;
  flex-direction: column;
}

/* One ladder rung: price (left) / size (right), depth bar fills behind from the right. */
.ob-row {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 3px 11px;
  overflow: hidden;
}

.ob-row + .ob-row {
  border-top: 1px solid var(--grid-line);
}

.ob-price,
.ob-size {
  position: relative;
  z-index: 1;
  font-size: 12.5px;
}

.ob-price {
  font-weight: 600;
}

.ob-size {
  text-align: right;
  color: var(--text-2);
}

/* 成交 row — the spread band, amber-ticked, dense mono. */
.ob-spread {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: baseline;
  gap: 10px;
  padding: 7px 11px;
  border-top: 1px solid var(--hairline);
  border-bottom: 1px solid var(--hairline);
  background: var(--surface-2);
}

.spread-label {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
}

.spread-price {
  font-size: 17px;
  font-weight: 700;
}

.spread-pct {
  font-size: 12.5px;
  font-weight: 600;
  text-align: right;
}

.ob-empty {
  padding: 12px 11px;
  text-align: center;
  color: var(--text-3);
  font-size: 12px;
}

.ob-placeholder {
  padding: 24px 11px;
}
</style>
