<template>
  <article class="card summary-card">
    <header class="row">
      <h3>{{ t('home_budget_summary.title', '預算簡表') }}</h3>
      <RouterLink class="jump" to="/budget">查看</RouterLink>
    </header>

    <div class="row mode-row">
      <button
        type="button"
        class="btn mini-mode-btn"
        :class="{ primary: displayMode === 'monthly' }"
        @click="setDisplayMode('monthly')"
      >
        {{ t('home_budget_summary.mode.monthly') }}
      </button>
      <button
        type="button"
        class="btn mini-mode-btn"
        :class="{ primary: displayMode === 'daily' }"
        @click="setDisplayMode('daily')"
      >
        {{ t('home_budget_summary.mode.daily') }}
      </button>
    </div>

    <div class="stat-wrap" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
      <BudgetMiniPie :ratio="usedRatio" :over="isOverBudget" :percent-label="usedPercentLabel" subtitle="已用" />

      <div class="remain-block">
        <div class="muted">剩餘</div>
        <div class="remain-value">
          <MoneyText :value-minor="displayRemainMinor" />
        </div>
      </div>

      <div class="right-stack">
        <div class="line">
          <span class="muted">預算</span>
          <MoneyText :value-minor="displayBudgetMinor" />
        </div>
        <div class="line">
          <span class="muted">已用</span>
          <MoneyText :value-minor="displaySpentMinor" />
        </div>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import BudgetMiniPie from '@/ui/components/budget/BudgetMiniPie.vue'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useI18n } from '@/ui/services/i18n.service'

const budgetStore = useBudgetStore()
const { t } = useI18n()
const displayMode = ref('monthly')
const touchStartX = ref(0)
const SWIPE_THRESHOLD_PX = 36

function toFiniteNonNegative(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, numeric)
}

const totalBudgetMinor = computed(() => toFiniteNonNegative(budgetStore.totalBudgetMinor))
const totalSpentMinor = computed(() => toFiniteNonNegative(budgetStore.totalSpentMinor))
const remainMinor = computed(() => Number(budgetStore.remainMinor ?? 0))

const monthDateMeta = computed(() => {
  const monthKey = String(budgetStore.monthKey ?? '').trim()
  const matched = /^(\d{4})-(\d{2})$/.exec(monthKey)
  const now = new Date()
  const year = Number(matched?.[1] ?? now.getFullYear())
  const monthIndex = Math.max(0, Number(matched?.[2] ?? now.getMonth() + 1) - 1)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const isCurrentMonth = year === now.getFullYear() && monthIndex === now.getMonth()
  const elapsedDays = isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth
  return {
    daysInMonth: Math.max(1, daysInMonth),
    elapsedDays: Math.max(1, elapsedDays),
  }
})

const displayBudgetMinor = computed(() => {
  if (displayMode.value !== 'daily') return totalBudgetMinor.value
  return Math.round(totalBudgetMinor.value / monthDateMeta.value.daysInMonth)
})

const displaySpentMinor = computed(() => {
  if (displayMode.value !== 'daily') return totalSpentMinor.value
  return Math.round(totalSpentMinor.value / monthDateMeta.value.elapsedDays)
})

const displayRemainMinor = computed(() => {
  if (displayMode.value !== 'daily') return remainMinor.value
  return displayBudgetMinor.value - displaySpentMinor.value
})

const usedRatio = computed(() => {
  if (!displayBudgetMinor.value) return 0
  const ratio = displaySpentMinor.value / displayBudgetMinor.value
  return Number.isFinite(ratio) ? ratio : 0
})

const usedPercentLabel = computed(() => `${Math.round(usedRatio.value * 100)}%`)
const isOverBudget = computed(() => displayBudgetMinor.value > 0 && usedRatio.value > 1)

function setDisplayMode(mode) {
  displayMode.value = mode === 'daily' ? 'daily' : 'monthly'
}

function onTouchStart(event) {
  touchStartX.value = Number(event?.changedTouches?.[0]?.clientX ?? event?.touches?.[0]?.clientX ?? 0)
}

function onTouchEnd(event) {
  const endX = Number(event?.changedTouches?.[0]?.clientX ?? 0)
  const deltaX = endX - touchStartX.value
  if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return
  setDisplayMode(deltaX < 0 ? 'daily' : 'monthly')
}
</script>

<style scoped>.summary-card {
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
.mode-row {
  margin-top: 10px;
  justify-content: flex-start;
  gap: 8px
}
.mini-mode-btn {
  min-height: 30px;
  padding: 6px 10px;
  font-size: 12px
}
.stat-wrap {
  margin-top: 12px;
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
}</style>
