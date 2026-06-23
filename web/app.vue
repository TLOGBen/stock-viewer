<script setup lang="ts">
// Root of the trading desk. Components and composables are auto-imported by Nuxt.
// Live data flows through the singleton useMarketData()/usePositions() composables,
// so this file is pure layout — no prop wiring required.
useHead({
  bodyAttrs: { class: "desk-body" },
});
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
