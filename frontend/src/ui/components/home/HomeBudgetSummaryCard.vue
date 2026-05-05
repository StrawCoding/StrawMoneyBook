<template>
  <article class="card summary-card">
    <header class="row">
      <h3>{{ t('home_budget_summary.title', '預算簡表') }}</h3>
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
              <div v-if="mode.key === 'daily'" class="line">
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
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import MoneyText from '@/ui/components/common/MoneyText.vue'
import BudgetMiniPie from '@/ui/components/budget/BudgetMiniPie.vue'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useI18n } from '@/ui/services/i18n.service'
import { getEffectiveTransactionAmountMinor, isCountableForBudget } from '@/ui/utils/refund-transaction'

const budgetStore = useBudgetStore()
const transactionStore = useTransactionStore()
const { t } = useI18n()
const displayModes = computed(() => ([
  { key: 'monthly', label: t('home_budget_summary.mode.monthly') },
  { key: 'daily', label: t('home_budget_summary.mode.daily') },
]))
const displayMode = ref('monthly')
const displayModeIndex = computed(() => {
  const index = displayModes.value.findIndex((mode) => mode.key === displayMode.value)
  return index >= 0 ? index : 0
})
const touchStartX = ref(0)
const SWIPE_THRESHOLD_PX = 72

function toFiniteNonNegative(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, numeric)
}

function normalizeAmountMode(value) {
  return String(value ?? '').trim() === 'daily_average' ? 'daily_average' : 'fixed'
}

function normalizeDayRuleUnit(value) {
  const normalized = String(value ?? '').trim()
  if (normalized === 'weekday' || normalized === 'monthday') return normalized
  return 'none'
}

function parseDayRuleValues(item, unit) {
  const rawValues = Array.isArray(item?.day_rule_values)
    ? item.day_rule_values
    : item?.day_rule_values_json
  let parsed = rawValues
  if (!Array.isArray(parsed)) {
    try {
      parsed = JSON.parse(String(rawValues ?? '[]'))
    } catch {
      parsed = []
    }
  }
  if (!Array.isArray(parsed)) return []
  const max = unit === 'monthday' ? 31 : 7
  return Array.from(
    new Set(
      parsed
        .map((value) => Math.trunc(Number(value)))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= max),
    ),
  )
}

function isBudgetItemActiveOnDate(item, date) {
  const amountMode = normalizeAmountMode(item?.amount_mode)
  if (amountMode !== 'daily_average') return true

  const ruleUnit = normalizeDayRuleUnit(item?.day_rule_unit)
  const ruleValues = parseDayRuleValues(item, ruleUnit)
  if (ruleUnit === 'none' || ruleValues.length <= 0) return false

  if (ruleUnit === 'monthday') {
    return ruleValues.includes(date.getDate())
  }

  const weekday = date.getDay() === 0 ? 7 : date.getDay()
  return ruleValues.includes(weekday)
}

function dateKeyOf(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isBudgetExpenseTransaction(tx) {
  return isCountableForBudget(tx)
}

function parseDayKey(dayKey) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey ?? '').trim())
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const parsed = new Date(year, month - 1, day)
  if (Number.isNaN(parsed.getTime())) return null
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null
  return parsed
}

const totalBudgetMinor = computed(() => toFiniteNonNegative(budgetStore.totalBudgetMinor))
const totalSpentMinor = computed(() => toFiniteNonNegative(budgetStore.totalSpentMinor))
const remainMinor = computed(() => Number(budgetStore.remainMinor ?? 0))
const reservedMinor = computed(() => toFiniteNonNegative(budgetStore.reservedMinor))
const selectedHomeDayDate = computed(() => {
  if (transactionStore.homeFilterMode !== 'day') return null
  return parseDayKey(transactionStore.homeFilterKey)
})

const monthDateMeta = computed(() => {
  const monthKey = String(budgetStore.monthKey ?? '').trim()
  const matched = /^(\d{4})-(\d{2})$/.exec(monthKey)
  const now = new Date()
  const year = Number(matched?.[1] ?? now.getFullYear())
  const monthIndex = Math.max(0, Number(matched?.[2] ?? now.getMonth() + 1) - 1)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const selectedHomeDay = selectedHomeDayDate.value
  const hasSelectedHomeDay = Boolean(
    selectedHomeDay
    && selectedHomeDay.getFullYear() === year
    && selectedHomeDay.getMonth() === monthIndex,
  )
  const selectedHomeDayValue = hasSelectedHomeDay
    ? Math.min(Math.max(1, selectedHomeDay.getDate()), daysInMonth)
    : 0
  const isCurrentMonth = year === now.getFullYear() && monthIndex === now.getMonth()
  const elapsedDays = hasSelectedHomeDay
    ? selectedHomeDayValue
    : (isCurrentMonth ? Math.min(now.getDate(), daysInMonth) : daysInMonth)
  const selectedDay = hasSelectedHomeDay
    ? selectedHomeDayValue
    : (isCurrentMonth ? elapsedDays : Math.min(Math.max(1, now.getDate()), daysInMonth))
  return {
    year,
    monthIndex,
    daysInMonth: Math.max(1, daysInMonth),
    selectedDate: new Date(year, monthIndex, selectedDay),
  }
})

const activeDailyBudgetItems = computed(() => {
  const { selectedDate } = monthDateMeta.value
  return budgetStore.items.filter((item) => {
    if (normalizeAmountMode(item?.amount_mode) !== 'daily_average') return false
    return isBudgetItemActiveOnDate(item, selectedDate)
  })
})

const activeDailyBudgetCategoryIds = computed(() => {
  return new Set(
    activeDailyBudgetItems.value
      .map((item) => String(item?.category_id ?? '').trim())
      .filter(Boolean),
  )
})

const dailyBudgetMinor = computed(() => {
  return activeDailyBudgetItems.value.reduce((total, item) => {
    const baseAmountMinor = Number(item?.amount_minor ?? 0)
    if (!Number.isFinite(baseAmountMinor) || baseAmountMinor <= 0) return total
    return total + Math.round(baseAmountMinor)
  }, 0)
})

const selectedDaySpentMinor = computed(() => {
  const selectedDayKey = dateKeyOf(monthDateMeta.value.selectedDate)
  if (!selectedDayKey) return 0

  const transactions = (
    transactionStore.homeFilterMode === 'day'
    || (transactionStore.homeFilterMode === 'month' && transactionStore.homeFilterKey === budgetStore.monthKey)
  )
    ? transactionStore.homeRecent
    : transactionStore.recent

  return transactions.reduce((total, tx) => {
    if (!isBudgetExpenseTransaction(tx)) return total
    const categoryId = String(tx?.category_id ?? '').trim()
    if (!categoryId || !activeDailyBudgetCategoryIds.value.has(categoryId)) return total
    if (dateKeyOf(new Date(tx.occurred_at)) !== selectedDayKey) return total
    return total + Math.abs(getEffectiveTransactionAmountMinor(tx))
  }, 0)
})

const dailySpentMinor = computed(() => selectedDaySpentMinor.value)
const dailyRemainMinor = computed(() => dailyBudgetMinor.value - dailySpentMinor.value)
const selectedDailyReservedMinor = computed(() => {
  return toFiniteNonNegative(
    budgetStore.reservedMinorByDate(monthDateMeta.value.selectedDate, { includeReferenceDay: false }),
  )
})

function calcMetricSet(mode) {
  const budgetMinor = mode === 'daily' ? dailyBudgetMinor.value : totalBudgetMinor.value
  const spentMinor = mode === 'daily' ? dailySpentMinor.value : totalSpentMinor.value
  const currentRemainMinor = mode === 'daily' ? dailyRemainMinor.value : remainMinor.value
  const currentReservedMinor = mode === 'daily' ? selectedDailyReservedMinor.value : reservedMinor.value
  const usedRatio = budgetMinor > 0 ? spentMinor / budgetMinor : 0
  const safeRatio = Number.isFinite(usedRatio) ? usedRatio : 0
  return {
    budgetMinor,
    spentMinor,
    remainMinor: currentRemainMinor,
    reservedMinor: currentReservedMinor,
    usedRatio: safeRatio,
    usedPercentLabel: `${Math.round(safeRatio * 100)}%`,
    isOverBudget: budgetMinor > 0 && safeRatio > 1,
  }
}

const modeMetrics = computed(() => ({
  monthly: calcMetricSet('monthly'),
  daily: calcMetricSet('daily'),
}))

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
  if (deltaX < 0) setDisplayMode('daily')
  else setDisplayMode('monthly')
}
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
