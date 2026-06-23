<script setup lang="ts">
// 看盤 — the trading floor. A decluttered 3-column desk: watchlist · compact
// detail (chart + stats, no embedded depth/volprofile) · order book + ticket +
// tick tape. Live data flows through the singleton composables, so this page is
// pure layout. Positions / heatmap / depth / volprofile live on their own pages.
</script>

<template>
  <div class="desk-grid">
    <section class="col col-watch">
      <WatchlistGrid />
    </section>

    <section class="col col-main">
      <DetailPanel />
    </section>

    <aside class="col col-side">
      <OrderBook />
      <OrderTicket />
      <TickTape />
    </aside>
  </div>
</template>

<style scoped>
.desk-grid {
  display: grid;
  grid-template-columns: minmax(300px, 340px) minmax(0, 1fr) minmax(300px, 360px);
  gap: var(--gap);
  align-items: start;
}

.col {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  min-width: 0;
}

.col-main {
  min-height: 0;
}

/* large desktop: widen rails slightly */
@media (min-width: 1700px) {
  .desk-grid {
    grid-template-columns: 380px minmax(0, 1fr) 400px;
  }
}

/* tablet/stacked */
@media (max-width: 1200px) {
  .desk-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
