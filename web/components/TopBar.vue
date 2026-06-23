<script setup lang="ts">
const md = useMarketData();
const pos = usePositions();
const { now, freshnessOf } = useFreshness();

// 台北時間 clock driven by the wall clock (never freezes when ticks stall),
// not by serverTime which only advances on server messages (PQ-2).
const clock = computed(() => formatTime(now.value));

// Freshness of the live feed: disconnected when the socket is not open, else
// derive live / stale / closed from the selected quote against market session.
const freshnessState = computed<"live" | "stale" | "closed" | "disconnected">(
  () => {
    if (md.connection.value !== "open") return "disconnected";
    return freshnessOf(md.selectedQuote.value, md.market.value);
  },
);

const totalPnl = computed(
  () => pos.totalUnrealized(md.quotes.value) + pos.totalRealized.value,
);

const pnlDirection = computed(() => directionOf(totalPnl.value));
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true" />
      <span class="brand-text">
        <span class="brand-name">即時交易台</span>
        <span class="brand-sub">TAIWAN TRADING DESK</span>
      </span>
    </div>

    <div class="meta">
      <div class="meta-cell">
        <span class="label">台北時間</span>
        <span class="meta-val mono">{{ clock }}</span>
      </div>

      <MarketStatus :market="md.market.value" />
      <FreshnessBadge :state="freshnessState" :as-of="md.lastTickAt.value" />
      <ConnectionBadge :state="md.connection.value" />

      <div class="meta-cell">
        <span class="label">總損益</span>
        <span class="meta-val mono" :class="signClass(pnlDirection)">
          {{ formatChange(totalPnl) }}
        </span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  /* sticky is handled by the layout's .desk-header wrapper so the nav bar
     below does not get covered by an independently-sticky topbar */
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gap);
  padding: 8px 18px;
  background: var(--surface);
  border-bottom: 1px solid var(--hairline);
}

.brand {
  display: flex;
  align-items: stretch;
  gap: 10px;
}

/* amber logo mark — a vertical bar to the left of the wordmark */
.brand-mark {
  width: 3px;
  align-self: stretch;
  background: var(--amber);
  border-radius: var(--radius-sm);
  flex: none;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.brand-name {
  font-size: 16px;
  font-weight: 800;
  color: var(--text);
  letter-spacing: 0.02em;
}

.brand-sub {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--text-3);
}

.meta {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* a label-over-value terminal cell (台北時間 / 總損益) */
.meta-cell {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  line-height: 1.1;
}

.meta-val {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
</style>
