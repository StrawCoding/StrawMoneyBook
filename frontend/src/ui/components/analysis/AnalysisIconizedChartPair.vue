<template>
  <section
    v-if="items.length"
    class="iconized-chart-pair"
    :data-testid="testId"
    :data-chart-tone="tone"
  >
    <header v-if="title" class="pair-head row">
      <h4>{{ title }}</h4>
      <span class="muted">{{ countLabel }}</span>
    </header>

    <div class="pair-layout">
      <div class="pie-panel">
        <div class="chart-title">{{ pieTitle }}</div>
        <button
          type="button"
          class="pie-button"
          :class="{ interactive: interactive && Boolean(primaryItem) }"
          :disabled="!(interactive && primaryItem)"
          :aria-label="primaryItem ? `${title} ${primaryItem.name}` : title"
          @click="emitSelect(primaryItem)"
        >
          <div class="pie" :style="pieStyle">
            <div class="pie-hole">
              <small class="muted">{{ totalLabel }}</small>
              <MoneyText :value-minor="totalMinor" :tone="tone" />
            </div>
          </div>
        </button>

        <ul class="pie-legend" data-testid="analysis-pie-legend">
          <li
            v-for="item in items"
            :key="`legend-${item.id}`"
            class="pie-legend-item"
          >
            <span class="icon-swatch" :style="{ background: item.color }">
              <font-awesome-icon
                v-if="item.icon"
                :icon="item.icon"
                class="swatch-icon"
              />
            </span>
            <span class="legend-name">{{ item.name }}</span>
            <span class="legend-percent">{{ item.percent }}%</span>
          </li>
        </ul>
      </div>

      <div class="bar-panel">
        <div class="chart-title">{{ barTitle }}</div>
        <ul class="bar-chart-list" data-testid="analysis-bar-list">
          <li v-for="item in barRows" :key="`bar-${item.id}`">
            <component
              :is="interactive ? 'button' : 'div'"
              :type="interactive ? 'button' : undefined"
              class="bar-chart-item"
              :class="{ interactive }"
              @click="interactive ? emitSelect(item) : undefined"
            >
              <div class="bar-chart-head">
                <div class="bar-chart-label">
                  <span class="icon-swatch" :style="{ background: item.color }">
                    <font-awesome-icon
                      v-if="item.icon"
                      :icon="item.icon"
                      class="swatch-icon"
                    />
                  </span>
                  <span class="bar-chart-name">{{ item.name }}</span>
                </div>
                <span class="bar-chart-percent">{{ item.percent }}%</span>
              </div>
              <div class="bar-chart-track">
                <span
                  class="bar-chart-fill"
                  :style="{ width: `${item.barWidthPercent}%`, background: item.color }"
                />
              </div>
              <div class="bar-chart-stats">
                <MoneyText :value-minor="item.amountMinor" :tone="tone" />
                <span class="muted">{{ itemCountLabel(item.count) }}</span>
              </div>
            </component>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { buildBarRows, buildPieStyle } from '@/core/utils/analysis-breakdown'
import { useI18n } from '@/ui/services/i18n.service'

const props = defineProps({
  title: { type: String, default: '' },
  totalLabel: { type: String, default: '' },
  totalMinor: { type: Number, default: 0 },
  count: { type: Number, default: 0 },
  items: { type: Array, default: () => [] },
  tone: { type: String, default: '' },
  interactive: { type: Boolean, default: false },
  testId: { type: String, default: 'analysis-iconized-chart' },
  pieTitle: { type: String, default: '' },
  barTitle: { type: String, default: '' },
})

const emit = defineEmits(['select'])
const { t } = useI18n()

const pieStyle = computed(() => buildPieStyle(props.items))
const barRows = computed(() => buildBarRows(props.items))
const primaryItem = computed(() => props.items[0] ?? null)
const countLabel = computed(() => t('analysis_page.items_count', { count: props.count }))
const pieTitle = computed(() => props.pieTitle || t('analysis_page.chart.pie'))
const barTitle = computed(() => props.barTitle || t('analysis_page.chart.bar'))

function itemCountLabel(count) {
  return t('analysis_page.items_count', { count })
}

function emitSelect(item) {
  if (!props.interactive || !item) return
  emit('select', item)
}
</script>

<style scoped>
.iconized-chart-pair {
  display: grid;
  gap: 10px;
}

.pair-head {
  gap: 12px;
  align-items: center;
}

.pair-head h4 {
  margin: 0;
}

.pair-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.pie-panel,
.bar-panel {
  border: 0;
  border-radius: 0;
  padding: 0;
  background: transparent;
  min-width: 0;
}

.chart-title {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 10px;
}

.pie-button {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: default;
}

.pie-button.interactive {
  cursor: pointer;
}

.pie {
  width: min(220px, 100%);
  aspect-ratio: 1;
  border-radius: 50%;
  position: relative;
  margin: 0 auto;
}

.pie-hole {
  position: absolute;
  inset: 22%;
  border-radius: 50%;
  background: var(--card);
  display: grid;
  place-items: center;
  text-align: center;
  gap: 4px;
  padding: 12px;
}

.pie-legend,
.bar-chart-list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.pie-legend-item,
.bar-chart-label,
.bar-chart-head,
.bar-chart-stats {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pie-legend-item,
.bar-chart-head,
.bar-chart-stats {
  justify-content: space-between;
}

.bar-chart-label {
  justify-content: flex-start;
  min-width: 0;
}

.icon-swatch {
  width: 22px;
  height: 22px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: #fff;
}

.swatch-icon {
  width: 12px;
  height: 12px;
}

.legend-name,
.bar-chart-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1 1 auto;
}

.legend-percent,
.bar-chart-percent {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

.bar-chart-item {
  display: grid;
  gap: 6px;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  color: inherit;
}

.bar-chart-item.interactive {
  cursor: pointer;
}

.bar-chart-track {
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--chart-track);
}

.bar-chart-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.muted {
  color: var(--muted);
}

@media (max-width: 720px) {
  .pair-layout {
    grid-template-columns: 1fr;
  }
}
</style>

<style>
/* Unscoped: parent report sets data-print-layout during PDF capture */
#analysis-report-document[data-print-layout='a4'] .pair-layout,
.analysis-report-document[data-print-layout='a4'] .pair-layout {
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) !important;
}
</style>
