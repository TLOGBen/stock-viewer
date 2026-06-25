<script setup lang="ts">
/**
 * 基本面 — 股利政策（年度/現金股利/股票股利/決議日，元/股）+ 最近一次除權息日.
 *
 * Reads the never-throw `useDividends` per-symbol resource and renders a mono
 * `.fin-table` (frontend-design §3). Dividend amounts are NOT 漲跌 figures, so
 * the value cells carry no 紅漲綠跌 colour — they stay plain mono. Every
 * non-success data state is delegated to <StateBlock> (loading / empty / error /
 * accumulating) so we never break the panel layout.
 *
 * Presentation-only: all row shaping lives in utils/dividendTable (pure,
 * unit-tested). This component only wires the resource to the template.
 */
import { computed, toRef } from "vue";
import { useDividends } from "~/composables/useStockResource";
import { toDividendRows, toExSummary } from "~/utils/dividendTable";

const props = defineProps<{ symbol: string }>();

const symbolRef = toRef(props, "symbol");
const { data, status, reload } = useDividends(symbolRef);

const rows = computed(() => toDividendRows(data.value?.series ?? []));
const exSummary = computed(() => toExSummary(data.value?.exDividend));
</script>

<template>
  <section class="panel dividend-table">
    <header class="panel-head">
      <span class="panel-title">股利政策</span>
    </header>
    <div class="panel-body">
      <StateBlock :status="status" @retry="reload">
        <p v-if="exSummary" class="ex-line dim mono">
          最近一次除權息日：{{ exSummary.date
          }}<template v-if="exSummary.kindLabel"> ({{ exSummary.kindLabel }})</template>
        </p>
        <table class="fin-table">
          <thead>
            <tr>
              <th scope="col">年度</th>
              <th scope="col">現金股利</th>
              <th scope="col">股票股利</th>
              <th scope="col">決議日</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.key">
              <td class="yr">{{ row.year }}</td>
              <td>{{ row.cash }}</td>
              <td>{{ row.stock }}</td>
              <td class="dim">{{ row.resolution }}</td>
            </tr>
          </tbody>
        </table>
      </StateBlock>
    </div>
  </section>
</template>

<style scoped>
.dividend-table {
  display: flex;
  flex-direction: column;
}

/* 最近一次除權息日 summary line — muted mono, above the table */
.ex-line {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.04em;
}

/* shared financial-table idiom (frontend-design §3) — mono, hairline rows */
.fin-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.fin-table th {
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-2);
  text-align: right;
  font-weight: 600;
  padding: 4px 8px;
}

.fin-table th:first-child,
.fin-table td:first-child {
  text-align: left;
}

.fin-table td {
  text-align: right;
  padding: 4px 8px;
  border-top: 1px solid var(--hairline);
  white-space: nowrap;
  color: var(--text);
}

.fin-table .yr {
  color: var(--text-2);
}

.fin-table .dim {
  color: var(--text-2);
}
</style>
