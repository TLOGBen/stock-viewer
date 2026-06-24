<script setup lang="ts">
// Horizontal top-nav for the routed pages. Sticky under the TopBar.
// The 個股 link tracks the live selected symbol from the singleton so it always
// deep-links to whatever the user is currently watching (falls back to 2330).
const md = useMarketData();

// Reactive target for the single-stock research page.
const stockTo = computed(() => `/stock/${md.selected.value || "2330"}`);

interface NavItem {
  readonly label: string;
  readonly to: string;
}

const items = computed<readonly NavItem[]>(() => [
  { label: "看盤", to: "/" },
  { label: "個股", to: stockTo.value },
  { label: "持倉", to: "/portfolio" },
  { label: "市場", to: "/market" },
  { label: "健康", to: "/health" },
]);

// Active-state lives in the path, not just NuxtLink's exact match — the 個股
// link's href changes with the selection, so we match the /stock prefix.
const route = useRoute();
function isActive(to: string): boolean {
  if (to === "/") return route.path === "/";
  if (to.startsWith("/stock/")) return route.path.startsWith("/stock");
  return route.path === to;
}
</script>

<template>
  <nav class="navmenu" aria-label="主選單">
    <ul class="navmenu-list">
      <li v-for="item in items" :key="item.label" class="navmenu-item">
        <NuxtLink
          :to="item.to"
          class="navmenu-link"
          :class="{ active: isActive(item.to) }"
          :aria-current="isActive(item.to) ? 'page' : undefined"
        >
          {{ item.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.navmenu {
  /* sticky handled by the layout's .desk-header wrapper (with the TopBar) */
  background: var(--surface-2);
  border-bottom: 1px solid var(--hairline);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}

.navmenu-list {
  display: flex;
  align-items: stretch;
  gap: 2px;
  margin: 0;
  padding: 0 12px;
  list-style: none;
  min-width: max-content;
}

.navmenu-item {
  display: flex;
}

.navmenu-link {
  display: inline-flex;
  align-items: center;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-3);
  text-decoration: none;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  transition: color 0.12s ease, border-color 0.12s ease;
}

.navmenu-link:hover {
  color: var(--text-2);
}

/* active — amber underline (terminal active marker), full-strength text */
.navmenu-link.active {
  color: var(--text);
  border-bottom-color: var(--amber);
}

.navmenu-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
}
</style>
