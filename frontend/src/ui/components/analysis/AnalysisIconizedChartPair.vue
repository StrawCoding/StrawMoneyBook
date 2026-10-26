<template>
  <section
    v-if="items.length"
    class="analysis-breakdown"
    :data-testid="testId"
    :data-chart-tone="tone"
  >
    <header v-if="title" class="breakdown-head row">
      <h4>{{ title }}</h4>
      <span class="muted">{{ countLabel }}</span>
    </header>

    <ul class="breakdown-list" data-testid="analysis-breakdown-list">
      <li v-for="item in barRows" :key="`row-${item.id}`">
        <component
          :is="interactive ? 'button' : 'div'"
          :type="interactive ? 'button' : undefined"
          class="breakdown-row"
          :class="{ interactive }"
          @click="interactive ? emitSelect(item) : undefined"
        >
          <div class="breakdown-row-head">
            <div class="breakdown-row-label">
              <span class="icon-swatch" :style="{ background: item.color }">
                <font-awesome-icon
                  v-if="item.icon"
                  :icon="item.icon"
                  class="swatch-icon"
                />
              </span>
              <span class="breakdown-row-name">{{ item.name }}</span>
            </div>
            <span class="breakdown-row-percent">{{ item.percent }}%</span>
          </div>
          <div class="breakdown-row-stats">
            <MoneyText :value-minor="item.amountMinor" :tone="tone" />
            <span class="muted">{{ itemCountLabel(item.count) }}</span>
          </div>
        </component>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import { buildBarRows } from '@/core/utils/analysis-breakdown'
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

const barRows = computed(() => buildBarRows(props.items))
const countLabel = computed(() => t('analysis_page.items_count', { count: props.count }))

function itemCountLabel(count) {
  return t('analysis_page.items_count', { count })
}

function emitSelect(item) {
  if (!props.interactive || !item) return
  emit('select', item)
}
</script>

<style scoped>
.analysis-breakdown {
  display: grid;
  gap: 10px;
}

.breakdown-head {
  gap: 12px;
  align-items: center;
}

.breakdown-head h4 {
  margin: 0;
}

.breakdown-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  border-radius: var(--habitat-radius-tile, 16px);
  overflow: hidden;
  background: var(--bg-soft);
}

.breakdown-list li + li {
  border-top: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
}

.breakdown-row {
  display: grid;
  gap: 6px;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 12px 14px;
  text-align: left;
  color: inherit;
}

.breakdown-row.interactive {
  cursor: pointer;
}

.breakdown-row.interactive:hover {
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}

.breakdown-row-head,
.breakdown-row-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}

.breakdown-row-label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
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

.breakdown-row-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.breakdown-row-percent {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

.muted {
  color: var(--muted);
}
</style>
