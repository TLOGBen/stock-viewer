<script setup lang="ts">
/**
 * 籌碼面 — 融資融券每日餘額（日期 / 融資餘額 / 融券餘額 / 券資比%，單位 張）.
 *
 * Reads the never-throw `useMargin` per-symbol resource and renders a mono
 * `.fin-table` (frontend-design §3). 餘額為股票水位而非漲跌損益，故不上色（無
 * 紅漲綠跌）；缺欄一律「—」。Every non-success data state is delegated to
 * <StateBlock> (loading / empty / error / accumulating) so we never break the
 * panel layout.
 *
 * Presentation-only (same prop-driven contract as InstitutionalTable.vue): the
 * page owns the `useMargin` resource and passes `status` + `data` down. All row
 * shaping lives in utils/marginTable (pure, unit-tested); this component only
 * maps the shaped rows onto the template.
 */
import { computed } from "vue";
import type { MarginView, ResourceStatus } from "~/types";
import StateBlock from "~/components/StateBlock.vue";
import { marginToRows } from "~/utils/marginTable";

const props = defineProps<{
  status: ResourceStatus;
  data: MarginView | null;
}>();

const emit = defineEmits<{ retry: [] }>();

const rows = computed(() => marginToRows(props.data?.days ?? []));
</script>

<template>
  <section class="panel margin-table">
    <header class="panel-head">
      <span class="panel-title">融資融券</span>
    </header>
    <div class="panel-body">
      <StateBlock :status="props.status" @retry="emit('retry')">
        <table class="fin-table">
          <thead>
            <tr>
              <th scope="col">日期</th>
              <th scope="col">融資餘額</th>
              <th scope="col">融券餘額</th>
              <th scope="col">券資比</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.date">
              <td>{{ row.dateLabel }}</td>
              <td>{{ row.marginBalanceText }}</td>
              <td>{{ row.shortBalanceText }}</td>
              <td>{{ row.shortMarginRatioText }}</td>
            </tr>
          </tbody>
        </table>
      </StateBlock>
    </div>
  </section>
</template>

<style scoped>
/* shared financial/籌碼 table style (frontend-design §3) */
.fin-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: 12px;
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
}
</style>
