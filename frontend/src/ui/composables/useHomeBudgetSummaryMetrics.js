import { computed, ref } from 'vue'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useI18n } from '@/ui/services/i18n.service'
import { getEffectiveTransactionAmountMinor, isCountableForBudget } from '@/ui/utils/refund-transaction'
import { resolvePoolStatsForDate } from '@/core/services/budget-pool-daily.js'
import { getDatePartsInTimeZone } from '@/core/services/budget-reserve.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'

export function useHomeBudgetSummaryMetrics() {
  const budgetStore = useBudgetStore()
  const transactionStore = useTransactionStore()
  const ledgerStore = useLedgerStore()
  const { t } = useI18n()
  const displayModes = computed(() => ([
    { key: 'monthly', label: isPayCycleMode.value ? t('home_budget_summary.mode.period') : t('home_budget_summary.mode.monthly') },
    { key: 'daily', label: t('home_budget_summary.mode.daily') },
  ]))
  const displayMode = ref('monthly')
  const displayModeIndex = computed(() => {
    const index = displayModes.value.findIndex((mode) => mode.key === displayMode.value)
    return index >= 0 ? index : 0
  })
  const touchStartX = ref(0)
  const SWIPE_THRESHOLD_PX = 72
  const isPayCycleMode = computed(() => String(ledgerStore.activeLedger?.budget_period_mode ?? '') === 'pay_cycle')

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

function ledgerTimeZone() {
  const timeZone = String(ledgerStore.activeLedger?.timezone ?? '').trim()
  return timeZone || 'Asia/Taipei'
}

function ledgerTodayParts(referenceDate = new Date()) {
  return getDatePartsInTimeZone(referenceDate, ledgerTimeZone())
}

function dateFromLedgerParts(parts) {
  if (!parts) return new Date()
  return new Date(parts.year, parts.month - 1, parts.day)
}

const totalBudgetMinor = computed(() => toFiniteNonNegative(budgetStore.totalBudgetMinor))
const totalSpentMinor = computed(() => toFiniteNonNegative(budgetStore.totalSpentMinor))
const remainMinor = computed(() => Number(budgetStore.remainMinor ?? 0))
const selectedMonthlyReservedMinor = computed(() => (
  toFiniteNonNegative(budgetStore.reservedMinorByDate(new Date(), { includeReferenceDay: true }))
))
const selectedHomeDayDate = computed(() => {
  if (transactionStore.homeFilterMode !== 'day') return null
  return parseDayKey(transactionStore.homeFilterKey)
})

const monthDateMeta = computed(() => {
  const monthKey = String(budgetStore.monthKey ?? '').trim()
  const matched = /^(\d{4})-(\d{2})$/.exec(monthKey)
  const nowParts = ledgerTodayParts() ?? {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
  }
  const year = Number(matched?.[1] ?? nowParts.year)
  const monthIndex = Math.max(0, Number(matched?.[2] ?? nowParts.month) - 1)
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
  const isCurrentMonth = year === nowParts.year && monthIndex === nowParts.month - 1
  const elapsedDays = hasSelectedHomeDay
    ? selectedHomeDayValue
    : (isCurrentMonth ? Math.min(nowParts.day, daysInMonth) : daysInMonth)
  const selectedDay = hasSelectedHomeDay
    ? selectedHomeDayValue
    : (isCurrentMonth ? elapsedDays : Math.min(Math.max(1, nowParts.day), daysInMonth))
  return {
    year,
    monthIndex,
    daysInMonth: Math.max(1, daysInMonth),
    selectedDate: dateFromLedgerParts({ year, month: monthIndex + 1, day: selectedDay }),
  }
})

const activeDailyBudgetItems = computed(() => {
  const { selectedDate } = monthDateMeta.value
  return budgetStore.items.filter((item) => {
    if (normalizeAmountMode(item?.amount_mode) !== 'daily_average') return false
    if (String(item?.budget_container_id ?? '').trim()) return false
    return isBudgetItemActiveOnDate(item, selectedDate)
  })
})

const rollingPoolContainers = computed(() => (budgetStore.containers ?? []))

const poolCategoryIdsByContainer = computed(() => {
  const map = new Map()
  for (const container of rollingPoolContainers.value) {
    const ids = new Set()
    for (const item of budgetStore.items) {
      if (String(item?.budget_container_id ?? '') !== String(container.id)) continue
      const categoryId = String(item?.category_id ?? '').trim()
      if (categoryId) ids.add(categoryId)
    }
    map.set(String(container.id), ids)
  }
  return map
})

const dailyPoolCategoryIds = computed(() => {
  const ids = new Set()
  for (const categoryIds of poolCategoryIdsByContainer.value.values()) {
    for (const categoryId of categoryIds) ids.add(categoryId)
  }
  return ids
})

const activeDailyBudgetCategoryIds = computed(() => {
  const ids = new Set(dailyPoolCategoryIds.value)
  for (const categoryId of activeDailyBudgetItems.value
    .map((item) => String(item?.category_id ?? '').trim())
    .filter(Boolean)) {
    ids.add(categoryId)
  }
  return ids
})

const homeBudgetTransactions = computed(() => (
  (
    transactionStore.homeFilterMode === 'day'
    || (transactionStore.homeFilterMode === 'month' && transactionStore.homeFilterKey === budgetStore.monthKey)
  )
    ? transactionStore.homeBudgetDayTransactions
    : transactionStore.recent
))

function sumPoolCategorySpent(categoryIds, { onDayKey = null, beforeDayKey = null, periodStart = null } = {}) {
  if (!categoryIds?.size) return 0
  return homeBudgetTransactions.value.reduce((total, tx) => {
    if (!isBudgetExpenseTransaction(tx)) return total
    const categoryId = String(tx?.category_id ?? '').trim()
    if (!categoryId || !categoryIds.has(categoryId)) return total
    const txDayKey = dateKeyOf(new Date(tx.occurred_at))
    if (!txDayKey) return total
    if (periodStart && txDayKey < periodStart) return total
    if (onDayKey && txDayKey !== onDayKey) return total
    if (beforeDayKey && !(txDayKey < beforeDayKey)) return total
    return total + Math.abs(getEffectiveTransactionAmountMinor(tx))
  }, 0)
}

const rollingPoolStats = computed(() => {
  const selectedDayKey = dateKeyOf(monthDateMeta.value.selectedDate)
  const period = budgetStore.period ?? {
    key: budgetStore.monthKey,
    monthKey: budgetStore.monthKey,
    startDate: `${budgetStore.monthKey}-01`,
    endDate: `${budgetStore.monthKey}-28`,
  }
  return rollingPoolContainers.value.map((container) => {
    const categoryIds = poolCategoryIdsByContainer.value.get(String(container.id)) ?? new Set()
    const spentOnDayMinor = sumPoolCategorySpent(categoryIds, { onDayKey: selectedDayKey })
    const spentBeforeMinor = sumPoolCategorySpent(categoryIds, {
      beforeDayKey: selectedDayKey,
      periodStart: period.startDate,
    })
    return resolvePoolStatsForDate({
      container,
      period,
      spentPeriodMinor: spentBeforeMinor + spentOnDayMinor,
      spentOnDayMinor,
      dayKey: selectedDayKey,
    })
  })
})

const dailyPoolBudgetMinor = computed(() => (
  rollingPoolStats.value.reduce((total, stats) => total + Math.max(0, stats.todayAllowanceMinor), 0)
))

const dailyBudgetMinor = computed(() => {
  const itemTotal = activeDailyBudgetItems.value.reduce((total, item) => {
    const baseAmountMinor = Number(item?.amount_minor ?? 0)
    if (!Number.isFinite(baseAmountMinor) || baseAmountMinor <= 0) return total
    return total + Math.round(baseAmountMinor)
  }, 0)
  return itemTotal + dailyPoolBudgetMinor.value
})

const selectedDaySpentMinor = computed(() => {
  const selectedDayKey = dateKeyOf(monthDateMeta.value.selectedDate)
  if (!selectedDayKey) return 0

  return homeBudgetTransactions.value.reduce((total, tx) => {
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
  const currentReservedMinor = mode === 'daily' ? selectedDailyReservedMinor.value : selectedMonthlyReservedMinor.value
  const usedRatio = budgetMinor > 0 ? spentMinor / budgetMinor : 0
  const safeRatio = Number.isFinite(usedRatio) ? usedRatio : 0
  const isOverBudget = mode === 'monthly'
    ? budgetStore.isMonthOver
    : (budgetMinor > 0 && safeRatio > 1)
  return {
    budgetMinor,
    spentMinor,
    remainMinor: currentRemainMinor,
    reservedMinor: currentReservedMinor,
    usedRatio: safeRatio,
    usedPercentLabel: `${Math.round(safeRatio * 100)}%`,
    isOverBudget,
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
  return {
    budgetStore,
    displayModes,
    displayMode,
    displayModeIndex,
    touchStartX,
    isPayCycleMode,
    modeMetrics,
    setDisplayMode,
    onTouchStart,
    onTouchEnd,
    t,
  }
}
