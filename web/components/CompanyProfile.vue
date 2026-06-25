<script setup lang="ts">
/**
 * 個股「公司基本資料」panel — 簡介 + 股務 in the shared `.statgrid` terminal idiom
 * (DetailPanel parity). Presentational only: it takes the never-throw
 * {@link CompanyView} resource (data + ResourceStatus) and renders, leaving the
 * fetch lifecycle to the page (useCompany). Non-success states fall through to
 * the shared <StateBlock> (loading / empty / error), so an un-covered or failed
 * symbol degrades to a centered mono line rather than a broken grid.
 *
 * No 經營業務 row by design (frontend-design.md §5) — the BWIBBU/opendata profile
 * carries no business-description field, so the panel stays factual.
 */
import { computed } from "vue";
import type { CompanyView, ResourceStatus } from "~/types";
import { profileRows } from "~/utils/companyProfile";

const props = defineProps<{
  status: ResourceStatus;
  data: CompanyView | null;
}>();

const emit = defineEmits<{ retry: [] }>();

const rows = computed(() => (props.data != null ? profileRows(props.data) : []));
</script>

<template>
  <section class="panel company-profile">
    <header class="panel-head">
      <span class="panel-title">公司基本資料</span>
    </header>
    <div class="panel-body">
      <StateBlock :status="props.status" @retry="emit('retry')">
        <div class="company-grid statgrid">
          <div v-for="r in rows" :key="r.label" class="stat">
            <span class="stat-k">{{ r.label }}</span>
            <span class="stat-v">{{ r.value }}</span>
          </div>
        </div>
      </StateBlock>
    </div>
  </section>
</template>

<style scoped>
/* Two-column dense statgrid — falls back to one column on narrow side panes. */
.company-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

/* Long free-text values (website / 股務代理) must wrap, not overflow the cell. */
.company-grid .stat-v {
  font-size: 12.5px;
  word-break: break-word;
}

@media (max-width: 640px) {
  .company-grid {
    grid-template-columns: 1fr;
  }
}
</style>
