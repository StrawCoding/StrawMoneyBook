import { computed, ref } from 'vue'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useI18n } from '@/ui/services/i18n.service'
import { resolveHomeDailyBudgetMetricsForDay } from '@/core/services/budget-daily-stats.js'
import { getDatePartsInTimeZone } from '@/core/services/budget-reserve.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import {
  getHomeBudgetSummaryDisplayMode,
  setHomeBudgetSummaryDisplayMode,
} from '@/ui/services/home-budget-summary-display-mode.service.js'

/** Shared across HomeBudgetSummaryCard + HomeModernOverview (same swipe / pill state). */
const sharedDisplayMode = ref(getHomeBudgetSummaryDisplayMode())

export function useHomeBudgetSummaryMetrics() {
  const budgetStore = useBudgetStore()
  const transactionStore = useTransactionStore()
  const ledgerStore = useLedgerStore()
  const { t } = useI18n()
  const displayModes = computed(() => ([
    { key: 'monthly', label: isPayCycleMode.value ? t('home_budget_summary.mode.period') : t('home_budget_summary.mode.monthly') },
    { key: 'daily', label: t('home_budget_summary.mode.daily') },
  ]))
  const displayMode = sharedDisplayMode
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

  function dateKeyOf(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
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

  const budgetPeriod = computed(() => budgetStore.period ?? {
    key: budgetStore.monthKey,
    monthKey: budgetStore.monthKey,
    startDate: `${budgetStore.monthKey}-01`,
    endDate: `${budgetStore.monthKey}-28`,
  })

  const dailyMetrics = computed(() => resolveHomeDailyBudgetMetricsForDay({
    dayKey: dateKeyOf(monthDateMeta.value.selectedDate),
    period: budgetPeriod.value,
    items: budgetStore.items,
    containers: budgetStore.containers,
    spentByCategoryDayRows: budgetStore.spentByCategoryDayRows,
  }))

  const dailyBudgetMinor = computed(() => dailyMetrics.value.plannedMinor)
  const dailySpentMinor = computed(() => dailyMetrics.value.spentOnDayMinor)
  const dailyRemainMinor = computed(() => dailyMetrics.value.remainMinor)
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
    displayMode.value = setHomeBudgetSummaryDisplayMode(mode)
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
