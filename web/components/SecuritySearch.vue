<script setup lang="ts">
import type { Security } from "~/types";

type Result = Security & { rank: number };

const { searchSecurities } = useApi();
const { addToWatchlist, select } = useMarketData();

const query = ref("");
const results = ref<Result[]>([]);
const open = ref(false);
const loading = ref(false);
const highlighted = ref(-1);
const searched = ref(false); // a query has actually returned (drives no-results copy)

const listboxId = "security-search-listbox";

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let runSeq = 0; // guards against out-of-order async responses

/** Exchange / type tag text for a result row. */
function tagOf(s: Security): string {
  if (s.type === "etf") return "ETF";
  if (s.type === "warrant") return "權證";
  if (s.type === "index") return "指數";
  return s.exch === "otc" ? "OTC" : "TSE";
}

function tagClass(s: Security): string {
  if (s.type === "etf") return "tag--etf";
  if (s.exch === "otc") return "tag--otc";
  return "tag--tse";
}

async function runSearch(q: string): Promise<void> {
  const seq = ++runSeq;
  const trimmed = q.trim();
  if (trimmed.length === 0) {
    results.value = [];
    searched.value = false;
    loading.value = false;
    highlighted.value = -1;
    return;
  }
  loading.value = true;
  const res = await searchSecurities(trimmed, 20);
  if (seq !== runSeq) return; // a newer search superseded this one
  results.value = res;
  searched.value = true;
  loading.value = false;
  highlighted.value = res.length > 0 ? 0 : -1;
}

watch(query, (q) => {
  open.value = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void runSearch(q);
  }, 250);
});

function reset(): void {
  query.value = "";
  results.value = [];
  searched.value = false;
  highlighted.value = -1;
  open.value = false;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function pick(s: Result | undefined): void {
  if (!s) return;
  void addToWatchlist(s.symbol);
  select(s.symbol);
  reset();
}

function onArrowDown(): void {
  if (results.value.length === 0) return;
  open.value = true;
  highlighted.value = (highlighted.value + 1) % results.value.length;
}

function onArrowUp(): void {
  if (results.value.length === 0) return;
  open.value = true;
  highlighted.value =
    highlighted.value <= 0
      ? results.value.length - 1
      : highlighted.value - 1;
}

function onEnter(): void {
  if (!open.value || results.value.length === 0) return;
  const idx = highlighted.value >= 0 ? highlighted.value : 0;
  pick(results.value[idx]);
}

function onFocus(): void {
  if (query.value.trim().length > 0) open.value = true;
}

function onBlur(): void {
  // Delay so a mousedown on a result can fire before the dropdown unmounts.
  setTimeout(() => {
    open.value = false;
  }, 120);
}

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});

const showDropdown = computed(
  () => open.value && query.value.trim().length > 0,
);
const activeDescendant = computed(() =>
  highlighted.value >= 0 ? `security-opt-${highlighted.value}` : undefined,
);
</script>

<template>
  <div class="search field">
    <label for="security-search-input">搜尋標的</label>
    <div class="search-box" role="combobox" :aria-expanded="showDropdown" aria-haspopup="listbox" :aria-owns="listboxId">
      <input
        id="security-search-input"
        v-model="query"
        type="text"
        class="input"
        placeholder="搜尋代號或名稱…"
        autocomplete="off"
        spellcheck="false"
        role="searchbox"
        aria-autocomplete="list"
        :aria-controls="listboxId"
        :aria-activedescendant="activeDescendant"
        @focus="onFocus"
        @blur="onBlur"
        @keydown.down.prevent="onArrowDown"
        @keydown.up.prevent="onArrowUp"
        @keydown.enter.prevent="onEnter"
        @keydown.esc.prevent="reset"
      />

      <ul
        v-if="showDropdown"
        :id="listboxId"
        class="dropdown"
        role="listbox"
        aria-label="搜尋結果"
      >
        <li v-if="loading" class="state" role="presentation">搜尋中…</li>
        <li
          v-else-if="searched && results.length === 0"
          class="state"
          role="presentation"
        >
          查無符合「{{ query.trim() }}」的標的
        </li>
        <li
          v-for="(r, i) in results"
          v-else
          :id="`security-opt-${i}`"
          :key="r.symbol"
          class="opt"
          :class="{ active: i === highlighted }"
          role="option"
          :aria-selected="i === highlighted"
          @mousedown.prevent="pick(r)"
          @mouseenter="highlighted = i"
        >
          <span class="opt-code mono">{{ r.symbol }}</span>
          <span class="opt-name">{{ r.name }}</span>
          <span class="tag" :class="tagClass(r)">{{ tagOf(r) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.search {
  position: relative;
}

.search-box {
  position: relative;
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 30;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 300px;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
}

.state {
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0.04em;
  color: var(--text-3);
  text-align: center;
}

/* hairline-separated terminal rows; cyan tint on active */
.opt {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-top: 1px solid var(--hairline);
  cursor: pointer;
  transition: background-color 0.1s ease;
}
.opt:first-child {
  border-top: 0;
}

.opt:hover {
  background: var(--surface-2);
}

.opt.active {
  background: var(--accent-soft);
  box-shadow: inset 2px 0 0 var(--accent);
}

.opt-code {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text);
  flex: 0 0 auto;
  min-width: 52px;
}

.opt-name {
  flex: 1 1 auto;
  font-size: 12px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  flex: 0 0 auto;
}

.tag--tse {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent);
}

.tag--otc {
  background: var(--flat-soft);
  color: var(--text-2);
}

.tag--etf {
  background: var(--amber-soft);
  border-color: var(--amber);
  color: var(--amber);
}
</style>
