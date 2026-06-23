<script setup lang="ts">
const { quotes, watchlist, selected, select, removeFromWatchlist } =
  useMarketData();

function onRemove(sym: string): void {
  void removeFromWatchlist(sym);
}
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="panel-title">自選股</span>
    </header>

    <div class="panel-body">
      <SecuritySearch />

      <ul class="grid" role="list" aria-label="自選股清單">
        <template v-for="sym in watchlist" :key="sym">
          <li class="card-wrap">
            <PriceCard
              v-if="quotes[sym]"
              :quote="quotes[sym]!"
              :active="sym === selected"
              @select="select"
            />
            <button
              v-else
              type="button"
              class="card placeholder"
              :class="{ active: sym === selected }"
              @click="select(sym)"
            >
              <span class="ph-code mono">{{ sym }}</span>
              <span class="ph-dash mono">—</span>
            </button>

            <button
              type="button"
              class="remove"
              :aria-label="`移除 ${sym}`"
              :title="`移除 ${sym}`"
              @click.stop="onRemove(sym)"
            >
              ✕
            </button>
          </li>
        </template>

        <li v-if="watchlist.length === 0" class="empty">
          尚未加入任何自選股，請於上方搜尋加入
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--gap-sm);
  margin-top: var(--gap-sm);
  /* semantic list (role=list) — strip default ul chrome */
  list-style: none;
  padding: 0;
}

@media (min-width: 420px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.empty {
  grid-column: 1 / -1;
  margin: 0;
}

.card-wrap {
  position: relative;
}

/* hover-revealed remove control on each card — square terminal chip */
.remove {
  position: absolute;
  top: 5px;
  right: 5px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1;
  opacity: 0;
  transition:
    opacity 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease;
}

.card-wrap:hover .remove,
.remove:focus-visible {
  opacity: 1;
}

.remove:hover {
  color: var(--up);
  border-color: var(--up);
}

/* placeholder card shown for a just-added symbol before its first quote */
.placeholder {
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

.placeholder:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

.placeholder.active {
  border-color: var(--amber);
  background: var(--surface-2);
}
.placeholder.active::before {
  content: "";
  position: absolute;
  top: -1px;
  bottom: -1px;
  left: -1px;
  width: 3px;
  background: var(--amber);
}

.ph-code {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text);
}

.ph-dash {
  font-size: 21px;
  font-weight: 700;
  line-height: 1;
  color: var(--text-3);
}
</style>
