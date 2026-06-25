<script setup lang="ts">
/**
 * 個股頁資訊分頁 (StockInfoTabs) — the tabbed container under the DetailPanel that
 * holds every 個股 research block (frontend-design.md §1). It owns the per-symbol
 * resource lifecycle for the presentational blocks and switches between three
 * terminal-style tabs, keeping the page from scrolling forever:
 *
 *   基本面: CompanyProfile · RevenueTable · FinancialsTable · DividendTable
 *   籌碼面: InstitutionalTable · MarginTable
 *   估值:   ValuationRiver (PE/PB)
 *
 * Data flow mirrors the rest of the desk: each block is presentational (takes a
 * never-throw resource `status` + `data`/`view`), so this component instantiates
 * the useStock* composables off a single `symbol` ref and threads the results
 * down. DividendTable is self-fetching (takes `symbol`), so it only needs the
 * symbol. Non-success states degrade through each block's <StateBlock>; nothing
 * here throws or breaks layout.
 *
 * 沿用既有風格: `.panel` hairline frame, amber-tick titles, mono density. The tab
 * bar is a mono underline-active row (`.info-tabs`), not a new visual language.
 */
import { ref, toRef } from "vue";
import {
  useCompany,
  useRevenue,
  useFinancials,
  useInstitutional,
  useMargin,
  useValuation,
  useDisclosures,
} from "~/composables/useStockResource";

const props = defineProps<{ symbol: string }>();
const symbolRef = toRef(props, "symbol");

type Tab = "fundamental" | "chip" | "valuation" | "news";
const TABS: ReadonlyArray<{ key: Tab; label: string }> = [
  { key: "fundamental", label: "基本面" },
  { key: "chip", label: "籌碼面" },
  { key: "valuation", label: "估值" },
  { key: "news", label: "訊息" },
];
const active = ref<Tab>("fundamental");

// Per-symbol resources (never-throw). Each re-loads when the symbol ref changes.
const company = useCompany(symbolRef);
const revenue = useRevenue(symbolRef);
const financials = useFinancials(symbolRef);
const institutional = useInstitutional(symbolRef);
const margin = useMargin(symbolRef);
const valuation = useValuation(symbolRef);
const disclosures = useDisclosures(symbolRef);
</script>

<template>
  <section class="stock-info-tabs">
    <nav class="info-tabs" role="tablist" aria-label="個股資訊">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        role="tab"
        class="info-tab mono"
        :class="{ active: active === t.key }"
        :aria-selected="active === t.key"
        @click="active = t.key"
      >
        {{ t.label }}
      </button>
    </nav>

    <div class="info-tab-body">
      <!-- 基本面 -->
      <div v-show="active === 'fundamental'" class="info-stack">
        <CompanyProfile :status="company.status.value" :data="company.data.value" />
        <RevenueTable
          :status="revenue.status.value"
          :view="revenue.data.value"
          :n="revenue.data.value?.series.length ?? null"
        />
        <FinancialsTable
          :status="financials.status.value"
          :view="financials.data.value"
        />
        <DividendTable :symbol="props.symbol" />
      </div>

      <!-- 籌碼面 -->
      <div v-show="active === 'chip'" class="info-stack">
        <InstitutionalTable
          :status="institutional.status.value"
          :data="institutional.data.value"
        />
        <MarginTable :status="margin.status.value" :data="margin.data.value" />
      </div>

      <!-- 估值 -->
      <div v-show="active === 'valuation'" class="info-stack">
        <ValuationRiver
          :status="valuation.status.value"
          :view="valuation.data.value"
          :n="valuation.data.value?.series.length ?? null"
        />
      </div>

      <!-- 訊息 -->
      <div v-show="active === 'news'" class="info-stack">
        <Disclosures
          :status="disclosures.status.value"
          :data="disclosures.data.value"
          @retry="disclosures.reload"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.stock-info-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  min-width: 0;
}

/* mono underline-active tab row — terminal风, not a new visual language */
.info-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--hairline);
}

.info-tab {
  appearance: none;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  padding: 7px 12px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-2);
  cursor: pointer;
  transition: color 0.15s ease;
}

.info-tab:hover {
  color: var(--text);
}

.info-tab.active {
  color: var(--text);
  border-bottom-color: var(--amber);
}

.info-tab:focus-visible {
  outline: 1px solid var(--amber);
  outline-offset: 2px;
}

.info-tab-body {
  min-width: 0;
}

.info-stack {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  min-width: 0;
}
</style>
