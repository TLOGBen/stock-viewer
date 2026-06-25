<script setup lang="ts">
/**
 * 月營收表 (RevenueTable) — a 個股頁 基本面 block. Renders a MonthlyRevenue
 * series newest-first in the shared `.fin-table` terminal style: 年月 / 當月營收
 * (千元 shown as 億 or thousands-separated) / 月增% / 年增% / 累計%.
 *
 * 紅漲綠跌: 月增/年增/累計 colour positive → c-up (red), negative → c-down
 * (green) via `pctSignClass`. Non-success states (loading / empty / error /
 * accumulating) are delegated to <StateBlock> so the panel never breaks layout.
 *
 * Presentational only: it takes a resource `status` + `view` and owns nothing
 * but local pagination state. Page integration (wiring useRevenue) happens in a
 * later step.
 */
import { computed, ref, watch } from "vue";
import type { RevenueView, ResourceStatus } from "~/types";
import {
  formatRevenue,
  formatRevenuePct,
  pctSignClass,
  formatYearMonth,
  pageSlice,
  pageCount,
  sortNewestFirst,
} from "~/utils/revenueFormat";

const props = defineProps<{
  /** Resource status from useRevenue (never-throw wrapper). */
  status: ResourceStatus;
  /** The revenue envelope; null until loaded / on failure. */
  view?: RevenueView | null;
  /** Accumulated-period count for the「歷史累積中」line (cold start). */
  n?: number | null;
}>();

const emit = defineEmits<{ retry: [] }>();

/** Page-size options (仿 winvest). */
const PAGE_SIZES = [10, 25, 50, 100] as const;

const pageSize = ref<number>(PAGE_SIZES[0]);
const page = ref(1);

/** Newest-first ordering — a new array, the prop series is never mutated. */
const rows = computed(() => sortNewestFirst(props.view?.series ?? []));

const totalPages = computed(() => pageCount(rows.value.length, pageSize.value));

/** Keep the current page in range as data / page-size change. */
watch([totalPages], () => {
  if (page.value > totalPages.value) page.value = totalPages.value;
  if (page.value < 1) page.value = 1;
});

const pageRows = computed(() => pageSlice(rows.value, page.value, pageSize.value));

const pageNumbers = computed(() =>
  Array.from({ length: totalPages.value }, (_, i) => i + 1),
);

function goTo(p: number): void {
  if (p < 1 || p > totalPages.value) return;
  page.value = p;
}

function onPageSize(event: Event): void {
  const next = Number((event.target as HTMLSelectElement).value);
  if (Number.isFinite(next) && next > 0) {
    pageSize.value = next;
    page.value = 1;
  }
}
</script>

<template>
  <section class="panel revenue-table">
    <header class="panel-head"><span class="panel-title">月營收</span></header>
    <div class="panel-body">
      <StateBlock :status="props.status" :n="props.n" @retry="emit('retry')">
        <table class="fin-table">
          <thead>
            <tr>
              <th scope="col">年月</th>
              <th scope="col">當月營收</th>
              <th scope="col">月增</th>
              <th scope="col">年增</th>
              <th scope="col">累計</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in pageRows" :key="r.yearMonth">
              <td class="ym">{{ formatYearMonth(r.yearMonth) }}</td>
              <td>{{ formatRevenue(r.revenueThousands) }}</td>
              <td :class="pctSignClass(r.momPct)">
                {{ formatRevenuePct(r.momPct) }}
              </td>
              <td :class="pctSignClass(r.yoyPct)">
                {{ formatRevenuePct(r.yoyPct) }}
              </td>
              <td :class="pctSignClass(r.accYoyPct)">
                {{ formatRevenuePct(r.accYoyPct) }}
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="totalPages > 1 || rows.length > PAGE_SIZES[0]" class="fin-pager">
          <button
            type="button"
            class="pager-arrow"
            :disabled="page <= 1"
            aria-label="上一頁"
            @click="goTo(page - 1)"
          >
            ‹
          </button>
          <button
            v-for="p in pageNumbers"
            :key="p"
            type="button"
            class="pager-num"
            :class="{ active: p === page }"
            :aria-current="p === page ? 'page' : undefined"
            @click="goTo(p)"
          >
            {{ p }}
          </button>
          <button
            type="button"
            class="pager-arrow"
            :disabled="page >= totalPages"
            aria-label="下一頁"
            @click="goTo(page + 1)"
          >
            ›
          </button>
          <select
            class="mono pager-size"
            :value="pageSize"
            aria-label="每頁筆數"
            @change="onPageSize"
          >
            <option v-for="s in PAGE_SIZES" :key="s" :value="s">{{ s }} / 頁</option>
          </select>
        </div>
      </StateBlock>
    </div>
  </section>
</template>

<style scoped>
.revenue-table {
  display: flex;
  flex-direction: column;
}

/* shared financial-table idiom — mono, hairline rows, right-aligned numbers */
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

.fin-table .ym {
  color: var(--text-2);
}

/* 月增/年增/累計 — 正=紅(c-up) 負=綠(c-down), sitewide 紅漲綠跌 */
.fin-table .c-up {
  color: var(--up);
}
.fin-table .c-down {
  color: var(--down);
}
.fin-table .c-flat {
  color: var(--text-3);
}

.fin-pager {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  font-family: var(--font-mono);
  font-size: 12px;
}

.pager-arrow,
.pager-num {
  background: none;
  border: none;
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 2px 6px;
  cursor: pointer;
  border-bottom: 1px solid transparent;
}

.pager-arrow:disabled {
  color: var(--text-dim);
  cursor: default;
}

.pager-num:hover:not(.active) {
  color: var(--text);
}

/* active page — amber underline (terminal tab idiom) */
.pager-num.active {
  color: var(--text);
  border-bottom-color: var(--amber);
}

.pager-size {
  margin-left: auto;
  background: var(--surface);
  color: var(--text-2);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-sm);
  font-size: 11px;
  padding: 2px 4px;
}
</style>
