<script setup lang="ts">
/**
 * 四燈號健診 hero (個股頁 headline). Renders the rolled-up overall score plus the
 * four face lamps (基本面 / 籌碼面 / 技術面 / 估值面) on the refined-terminal
 * surface — hairline `.panel`, amber section tick, mono density.
 *
 * 語意鐵律 (紅漲綠跌): a face/overall signal colours via `signalClass`
 * (bullish→c-up 紅, bearish→c-down 綠, neutral→c-flat 灰). To avoid a second
 * green meaning on the same page, the overall「弱→強」progress bar is a single
 * `--amber` fill (NOT red/green); only the big score and the four lamps take a
 * semantic colour.
 *
 * A face whose `coverage === false` dims to grey and shows「—」instead of a
 * score, with a「資料準備中」tooltip — the source has no data for this symbol yet.
 *
 * Non-success resource states (loading / empty / error / accumulating) render
 * through the shared <StateBlock>; on success the default slot paints the hero.
 */
import { computed } from "vue";
import type { FaceName, HealthLights, ResourceStatus } from "~/types";
import StateBlock from "~/components/StateBlock.vue";
import { signalClass, signalLabel, faceLabel } from "~/utils/stockSignals";

const props = defineProps<{
  status: ResourceStatus;
  data: HealthLights | null;
}>();

const emit = defineEmits<{ retry: [] }>();

/** Fixed face order for the「詳細數據」list — mirrors the domain headline order. */
const DETAIL_FACE_ORDER: readonly FaceName[] = [
  "fundamental",
  "chip",
  "technical",
  "valuation",
];

/**
 * 四燈號健診詳細數據: the covered faces that carry rule-based reasons, in a fixed
 * order. Each face's `reasons[]` already arrives as human-readable, number-bearing
 * judgement lines from the domain scorer; we just surface them grouped per face
 * (the winvest「四燈號健診詳細數據」block). Faces with no coverage/reasons drop out.
 */
const detailFaces = computed(() => {
  const faces = props.data?.faces ?? [];
  return DETAIL_FACE_ORDER.map((name) =>
    faces.find((f) => f.face === name),
  ).filter((f): f is NonNullable<typeof f> =>
    f != null && f.coverage && f.reasons.length > 0,
  );
});

/** Clamp the overall score to a sane bar width even if the wire drifts. */
const barWidth = computed(() => {
  const s = props.data?.overall.score ?? 0;
  const clamped = s < 0 ? 0 : s > 100 ? 100 : s;
  return `${clamped}%`;
});

const overallClass = computed(() =>
  props.data ? signalClass(props.data.overall.signal) : "c-flat",
);

/**
 * Round a score for display. The wire value carries full float precision
 * (e.g. 54.7342903…) which overflowed the hero; the headline already rounds
 * ("55 分"), so the big number and lamp scores match it as clean integers.
 */
const fmt = (n: number): number => Math.round(n);
</script>

<template>
  <section class="panel health-lights">
    <header class="panel-head">
      <span class="panel-title">四燈號健診</span>
    </header>

    <div class="panel-body">
      <StateBlock :status="props.status" @retry="emit('retry')">
        <div v-if="props.data" class="hl-body">
          <div class="hl-gauge" :class="overallClass">
            <div class="hl-score-row">
              <span class="hl-score mono">{{ fmt(props.data.overall.score) }}</span>
              <span class="hl-max dim mono">/100</span>
            </div>
            <div class="hl-bar" aria-hidden="true">
              <i :style="{ width: barWidth }" />
            </div>
          </div>

          <ul class="hl-faces">
            <li
              v-for="f in props.data.faces"
              :key="f.face"
              class="hl-face"
              :class="{ dim: !f.coverage }"
              :title="f.coverage ? undefined : '資料準備中'"
            >
              <span
                class="lamp"
                :class="f.coverage ? signalClass(f.signal) : 'c-flat'"
                aria-hidden="true"
                >●</span
              >
              <span class="hl-face-name mono">{{ faceLabel(f.face) }}</span>
              <span class="hl-face-score mono">{{
                f.coverage ? `${fmt(f.score)}/25` : "—"
              }}</span>
            </li>
          </ul>

          <p class="hl-headline dim">{{ props.data.headline }}</p>

          <!-- 四燈號健診詳細數據: per-face rule-based reasons (winvest 明細區) -->
          <div v-if="detailFaces.length" class="hl-detail">
            <span class="hl-detail-title mono">四燈號健診詳細數據</span>
            <div
              v-for="f in detailFaces"
              :key="f.face"
              class="hl-detail-face"
            >
              <span class="hl-detail-head mono" :class="signalClass(f.signal)">
                <span class="lamp" :class="signalClass(f.signal)" aria-hidden="true"
                  >●</span
                >
                {{ faceLabel(f.face) }} · {{ signalLabel(f.signal) }}
                {{ fmt(f.score) }}/25
              </span>
              <ul class="hl-detail-reasons mono">
                <li v-for="(r, i) in f.reasons" :key="i">{{ r }}</li>
              </ul>
            </div>
          </div>
        </div>
      </StateBlock>
    </div>
  </section>
</template>

<style scoped>
.hl-body {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--gap);
  align-items: center;
}

/* left: big overall score + amber 弱→強 bar (single colour, not red/green) */
.hl-gauge {
  min-width: 92px;
}

.hl-score-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.hl-score {
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
  color: var(--text);
}

.hl-gauge.c-up .hl-score {
  color: var(--up);
}

.hl-gauge.c-down .hl-score {
  color: var(--down);
}

.hl-gauge.c-flat .hl-score {
  color: var(--flat);
}

.hl-max {
  font-size: 13px;
}

.hl-bar {
  height: 4px;
  background: var(--flat-soft);
  border-radius: 2px;
  margin-top: 7px;
  overflow: hidden;
}

.hl-bar > i {
  display: block;
  height: 100%;
  background: var(--amber);
  border-radius: 2px;
  transition: width 0.3s ease;
}

@media (prefers-reduced-motion: reduce) {
  .hl-bar > i {
    transition: none;
  }
}

/* right: 2×2 lamp grid */
.hl-faces {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.hl-face {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.hl-face.dim {
  opacity: 0.55;
}

.lamp {
  font-size: 11px;
  line-height: 1;
}

.lamp.c-up {
  color: var(--up);
}

.lamp.c-down {
  color: var(--down);
}

.lamp.c-flat {
  color: var(--flat);
}

.hl-face-name {
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-2);
  white-space: nowrap;
}

.hl-face-score {
  margin-left: auto;
  font-weight: 600;
  white-space: nowrap;
}

.hl-headline {
  font-size: 12px;
  line-height: 1.4;
  grid-column: 1 / -1;
  margin: 6px 0 0;
}

/* 四燈號健診詳細數據: a hairline-topped per-face reason list under the headline */
.hl-detail {
  grid-column: 1 / -1;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--hairline);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
}

.hl-detail-title {
  grid-column: 1 / -1;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-2);
}

.hl-detail-face {
  min-width: 0;
}

.hl-detail-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
}

.hl-detail-head.c-up {
  color: var(--up);
}

.hl-detail-head.c-down {
  color: var(--down);
}

.hl-detail-head.c-flat {
  color: var(--flat);
}

.hl-detail-reasons {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hl-detail-reasons li {
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-2);
}

@media (max-width: 640px) {
  .hl-body {
    grid-template-columns: 1fr;
  }

  .hl-faces {
    grid-column: 1 / -1;
  }

  .hl-detail {
    grid-template-columns: 1fr;
  }
}
</style>
