<template>
  <article class="card summary-card">
    <header class="row">
      <div>
        <h3>{{ t('home_budget_summary.title', '預算簡表') }}</h3>
        <p v-if="isPayCycleMode" class="muted period-copy">
          {{ t('budgeting.period.pay_cycle_range', { start: budgetStore.period?.startDate, end: budgetStore.period?.endDate }) }}
          <span v-if="budgetStore.period?.nextPayDate"> · {{ t('budgeting.period.next_pay_day', { date: budgetStore.period.nextPayDate }) }}</span>
        </p>
      </div>
      <RouterLink class="jump" to="/budget">{{ t('home_budget_summary.view') }}</RouterLink>
    </header>

    <div class="stat-viewport" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
      <div class="stat-track" :style="{ transform: `translateX(-${displayModeIndex * 100}%)` }">
        <section v-for="mode in displayModes" :key="mode.key" class="stat-page">
          <div class="mode-label muted">{{ mode.label }}</div>
          <div class="stat-wrap">
            <BudgetMiniPie
              :ratio="modeMetrics[mode.key].usedRatio"
              :over="modeMetrics[mode.key].isOverBudget"
              :percent-label="modeMetrics[mode.key].usedPercentLabel"
              :subtitle="t('home_budget_summary.used')"
            />

            <div class="remain-block">
              <div class="muted">{{ t('home_budget_summary.remain') }}</div>
              <div class="remain-value">
                <MoneyText :value-minor="modeMetrics[mode.key].remainMinor" />
              </div>
            </div>

            <div class="right-stack">
              <div class="line">
                <span class="muted">{{ t('home_budget_summary.budget') }}</span>
                <MoneyText :value-minor="modeMetrics[mode.key].budgetMinor" />
              </div>
              <div class="line">
                <span class="muted">{{ t('home_budget_summary.used') }}</span>
                <MoneyText :value-minor="modeMetrics[mode.key].spentMinor" />
              </div>
              <div class="line">
                <span class="muted">{{ t('budgeting.reserved') }}</span>
                <MoneyText :value-minor="modeMetrics[mode.key].reservedMinor" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <div class="pager-dots" role="tablist" :aria-label="t('home_budget_summary.title', '預算簡表')">
      <button
        v-for="mode in displayModes"
        :key="`dot-${mode.key}`"
        type="button"
        class="pager-dot"
        :class="{ active: displayMode === mode.key }"
        :aria-label="mode.label"
        :aria-selected="displayMode === mode.key ? 'true' : 'false'"
        role="tab"
        @click="setDisplayMode(mode.key)"
      >
        <span class="dot-core"></span>
      </button>
    </div>
  </article>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import BudgetMiniPie from '@/ui/components/budget/BudgetMiniPie.vue'
import { useHomeBudgetSummaryMetrics } from '@/ui/composables/useHomeBudgetSummaryMetrics.js'
import { useI18n } from '@/ui/services/i18n.service'

const { t } = useI18n()
const {
  budgetStore,
  displayModes,
  displayMode,
  displayModeIndex,
  isPayCycleMode,
  modeMetrics,
  setDisplayMode,
  onTouchStart,
  onTouchEnd,
} = useHomeBudgetSummaryMetrics()
</script>

<style scoped>
.summary-card {
  padding: 14px
}
h3 {
  margin: 0;
  font-size: 16px
}
.jump {
  text-decoration: none;
  color: var(--primary-soft);
  font-size: 13px
}
.stat-viewport {
  margin-top: 12px;
  overflow: hidden
}
.stat-track {
  display: flex;
  transition: transform 220ms ease
}
.stat-page {
  width: 100%;
  flex: 0 0 100%
}
.mode-label {
  margin-bottom: 6px;
  font-size: 12px
}
.period-copy {
  margin: 4px 0 0;
  font-size: 12px
}
.stat-wrap {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) minmax(0, 1.35fr);
  align-items: center;
  gap: 10px
}
.remain-block {
  display: grid;
  gap: 4px
}
.remain-value {
  font-weight: 700
}
.right-stack {
  display: grid;
  gap: 6px
}
.line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px
}
.pager-dots {
  margin-top: 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px
}
.pager-dot {
  border: none;
  background: transparent;
  padding: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer
}
.dot-core {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #b8b8b8;
  opacity: 1;
  transition: width 180ms ease, opacity 180ms ease, background-color 180ms ease
}
.pager-dot.active .dot-core {
  width: 18px;
  background: var(--primary);
  opacity: 1
}
</style>
