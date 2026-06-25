<script setup lang="ts">
/**
 * 財報表 (FinancialsTable) — a 個股頁 基本面 block. Renders the most-recent
 * quarter from the `/api/financials/:symbol` envelope (FinancialsView) in the
 * shared `.fin-table` terminal style, with two sub-tabs:
 *
 *   損益    — 營業收入 / 營業毛利 / 營業利益 / 本期淨利 / 基本每股盈餘 (EPS).
 *             Amounts are 仟元 (shown as 億 or 仟); EPS is 元/share.
 *   財務比率 — 毛利率 / 營益率 / 淨利率 / 負債比率 / 股東權益報酬率 (%).
 *
 * 紅漲綠跌 only applies to signed deltas — the figures here are levels, so the
 * 損益/比率 magnitudes render in the neutral text colour and are NOT coloured.
 *
 * Presentational only: it takes a resource `status` + `view` and owns nothing
 * but the local sub-tab selection. Non-success states (loading / empty / error /
 * accumulating) are delegated to <StateBlock> so the panel never breaks layout.
 * Page integration (wiring useFinancials) happens in a later step.
 */
import { computed, ref } from "vue";
import type { FinancialsView, ResourceStatus } from "~/types";
import {
  incomeRows,
  ratioRows,
  formatThousands,
  formatEps,
  formatRatioPct,
} from "~/utils/financialsTransform";

const props = defineProps<{
  /** Resource status from useFinancials (never-throw wrapper). */
  status: ResourceStatus;
  /** The financials envelope; null until loaded / on failure. */
  view?: FinancialsView | null;
  /** Accumulated-period count for the「歷史累積中」line (cold start). */
  n?: number | null;
}>();

const emit = defineEmits<{ retry: [] }>();

type SubTab = "income" | "ratio";
const tab = ref<SubTab>("income");

/** 損益 rows (新→舊 order is irrelevant; single quarter). */
const income = computed(() => incomeRows(props.view ?? null));
/** 財務比率 rows. */
const ratios = computed(() => ratioRows(props.view ?? null));

/** Reporting period label for the panel sub-title (e.g. "2025Q1"). */
const period = computed(() => props.view?.statement?.period ?? "");
</script>

<template>
  <section class="panel financials-table">
    <header class="panel-head">
      <span class="panel-title">財報</span>
      <span v-if="period" class="fin-period mono dim">{{ period }}</span>
    </header>
    <div class="panel-body">
      <StateBlock :status="props.status" :n="props.n" @retry="emit('retry')">
        <nav class="info-tabs" role="tablist" aria-label="財報子分頁">
          <button
            type="button"
            role="tab"
            class="info-tab"
            :class="{ active: tab === 'income' }"
            :aria-selected="tab === 'income'"
            @click="tab = 'income'"
          >
            損益
          </button>
          <button
            type="button"
            role="tab"
            class="info-tab"
            :class="{ active: tab === 'ratio' }"
            :aria-selected="tab === 'ratio'"
            @click="tab = 'ratio'"
          >
            財務比率
          </button>
        </nav>

        <table v-if="tab === 'income'" class="fin-table">
          <thead>
            <tr>
              <th scope="col">項目</th>
              <th scope="col">金額</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in income" :key="r.label">
              <td class="item">{{ r.label }}</td>
              <td>
                {{ r.isEps ? formatEps(r.thousands) : formatThousands(r.thousands) }}
              </td>
            </tr>
          </tbody>
        </table>

        <table v-else class="fin-table">
          <thead>
            <tr>
              <th scope="col">比率</th>
              <th scope="col">%</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in ratios" :key="r.label">
              <td class="item">{{ r.label }}</td>
              <td>{{ formatRatioPct(r.pct) }}</td>
            </tr>
          </tbody>
        </table>
      </StateBlock>
    </div>
  </section>
</template>

<style scoped>
.financials-table {
  display: flex;
  flex-direction: column;
}

.fin-period {
  margin-left: auto;
  font-size: 11px;
  letter-spacing: 0.06em;
}

/* sub-tab row — mono, amber-underline active (terminal tab idiom, small) */
.info-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.info-tab {
  background: none;
  border: none;
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  padding: 2px 0;
  cursor: pointer;
  border-bottom: 1px solid transparent;
}

.info-tab:hover:not(.active) {
  color: var(--text);
}

.info-tab.active {
  color: var(--text);
  border-bottom-color: var(--amber);
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

.fin-table .item {
  color: var(--text-2);
}
</style>
