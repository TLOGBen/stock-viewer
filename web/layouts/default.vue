<script setup lang="ts">
// Persistent chrome around every routed page. TopBar + NavMenu + footer live here
// so they survive client-side navigation; the live singletons (useMarketData /
// usePositions) keep the WS + selected state alive across page switches.
</script>

<template>
  <div class="desk">
    <header class="desk-header">
      <TopBar />
      <NavMenu />
    </header>

    <main class="page-main">
      <slot />
    </main>

    <footer class="desk-foot">
      <span>即時交易台 · Taiwan Trading Desk</span>
      <span class="foot-sep">·</span>
      <span>資料來源：臺灣證券交易所 MIS 即時報價（僅供展示，非投資建議）</span>
    </footer>
  </div>
</template>

<style scoped>
.desk {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* TopBar + NavMenu stick to the top together as one header unit. */
.desk-header {
  position: sticky;
  top: 0;
  z-index: 20;
}

.page-main {
  flex: 1;
  padding: var(--gap);
  min-width: 0;
}

.desk-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  align-items: center;
  padding: 14px var(--gap) 22px;
  color: var(--text-3);
  font-size: 12px;
}
.foot-sep {
  color: var(--text-dim);
}
</style>
