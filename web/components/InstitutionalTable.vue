<script setup lang="ts">
/**
 * 籌碼面 — 三大法人每日買賣超（外資/投信/自營/合計，單位 張）.
 *
 * Reads the never-throw `useInstitutional` per-symbol resource and renders a
 * mono `.fin-table` (frontend-design §3). 紅漲綠跌 鐵律: 買超(正)=紅(c-up)，
 * 賣超(負)=綠(c-down). Every non-success data state is delegated to
 * <StateBlock> (loading / empty / error / accumulating) so we never break the
 * panel layout.
 *
 * Presentation-only (same prop-driven contract as HealthLights.vue): the page
 * owns the `useInstitutional` resource and passes `status` + `data` down. All
 * row shaping lives in utils/institutionalTable (pure, unit-tested); this
 * component only maps the shaped rows onto the template.
 */
import { computed } from "vue";
import type { InstitutionalView, ResourceStatus } from "~/types";
import StateBlock from "~/components/StateBlock.vue";
import { institutionalToRows } from "~/utils/institutionalTable";

const props = defineProps<{
  status: ResourceStatus;
  data: InstitutionalView | null;
}>();

const emit = defineEmits<{ retry: [] }>();

const rows = computed(() => institutionalToRows(props.data?.days ?? []));
</script>

<template>
  <section class="panel institutional-table">
    <header class="panel-head">
      <span class="panel-title">三大法人</span>
    </header>
    <div class="panel-body">
      <StateBlock :status="props.status" @retry="emit('retry')">
        <table class="fin-table">
          <thead>
            <tr>
              <th scope="col">日期</th>
              <th scope="col">外資</th>
              <th scope="col">投信</th>
              <th scope="col">自營</th>
              <th scope="col">合計</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.date">
              <td>{{ row.dateLabel }}</td>
              <td :class="row.foreign.cls">{{ row.foreign.text }}</td>
              <td :class="row.trust.cls">{{ row.trust.text }}</td>
              <td :class="row.dealer.cls">{{ row.dealer.text }}</td>
              <td :class="row.total.cls">{{ row.total.text }}</td>
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

/* 紅漲綠跌: 買超(正)=紅 賣超(負)=綠 */
.fin-table .c-up {
  color: var(--up);
}

.fin-table .c-down {
  color: var(--down);
}

.fin-table .c-flat {
  color: var(--text-2);
}
</style>
