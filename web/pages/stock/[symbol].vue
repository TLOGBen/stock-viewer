<script setup lang="ts">
// 個股 — single-stock research, deep-linkable via /stock/[symbol]. On mount and
// whenever the route param changes, focus the singleton on the requested symbol
// so the shared WS feed, chart, and order wiring all converge on it. The
// detailed DetailPanel embeds 五檔深度 + 量價分佈; a side column carries the order
// book + ticket so the user can analyze and trade the deep-linked stock.
const route = useRoute();
const md = useMarketData();

/** Normalize the route param (string | string[] | undefined) to a symbol. */
function symbolFrom(param: string | string[] | undefined): string {
  return Array.isArray(param) ? (param[0] ?? "") : (param ?? "");
}

// Focus the singleton on the route symbol. SSR-safe: select() only mutates the
// shared ref; the backend tolerates unknown/empty symbols. immediate covers the
// initial render and direct deep-links; the watch covers in-app navigation.
watch(
  () => route.params.symbol,
  (param) => {
    const symbol = symbolFrom(param);
    if (symbol) md.select(symbol);
  },
  { immediate: true },
);
</script>

<template>
  <div class="stock-grid">
    <section class="col col-main">
      <DetailPanel detailed />
    </section>

    <aside class="col col-side">
      <OrderBook />
      <OrderTicket />
    </aside>
  </div>
</template>

<style scoped>
.stock-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
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

@media (min-width: 1700px) {
  .stock-grid {
    grid-template-columns: minmax(0, 1fr) 400px;
  }
}

/* tablet/stacked */
@media (max-width: 1200px) {
  .stock-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
