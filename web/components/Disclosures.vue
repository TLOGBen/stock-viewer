<script setup lang="ts">
/**
 * 訊息 — 個股重大訊息 (official material announcements, t187ap04_L). Replaces
 * winvest's「相關新聞」with the official MOPS-equivalent feed; there are NO view
 * counts officially, so none are shown (the column is honestly absent). 來源 is
 * labelled「公開資訊觀測站」.
 *
 * Presentation-only (same prop-driven contract as the other 個股 blocks): the
 * page owns the `useDisclosures` resource and passes `status` + `data` down.
 * Non-success states delegate to <StateBlock>; cold-start (a stock with no
 * recent disclosures) resolves to the empty state — honest, not an error.
 */
import { computed } from "vue";
import type { DisclosuresView, ResourceStatus } from "~/types";
import StateBlock from "~/components/StateBlock.vue";

const props = defineProps<{
  status: ResourceStatus;
  data: DisclosuresView | null;
}>();

const emit = defineEmits<{ retry: [] }>();

/** "1150624" → "115/06/24" (ROC display); pass through anything unexpected. */
function rocLabel(d: string): string {
  return /^\d{7}$/.test(d) ? `${d.slice(0, 3)}/${d.slice(3, 5)}/${d.slice(5, 7)}` : d;
}

const items = computed(() => props.data?.items ?? []);
</script>

<template>
  <section class="panel disclosures">
    <header class="panel-head">
      <span class="panel-title">重大訊息</span>
      <span class="disc-source dim mono">資料來源：公開資訊觀測站</span>
    </header>
    <div class="panel-body">
      <StateBlock :status="props.status" @retry="emit('retry')">
        <ul class="disc-list">
          <li
            v-for="(d, i) in items"
            :key="`${d.dateRoc}-${d.time}-${i}`"
            class="disc-item"
          >
            <span class="disc-date mono dim">{{ rocLabel(d.dateRoc) }}</span>
            <span class="disc-subject">{{ d.subject }}</span>
          </li>
        </ul>
      </StateBlock>
    </div>
  </section>
</template>

<style scoped>
.disc-source {
  margin-left: auto;
  font-size: 10px;
}

.disc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.disc-item {
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 5px 0;
  border-top: 1px solid var(--hairline);
}

.disc-item:first-child {
  border-top: none;
}

.disc-date {
  flex: none;
  font-size: 11px;
}

.disc-subject {
  font-size: 12.5px;
  color: var(--text);
  line-height: 1.4;
}
</style>
