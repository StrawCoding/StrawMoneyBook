/**
 * Rolling daily allowance for shared budget pools (monthly + daily).
 * todayAllowance = floor(max(0, periodBudget - spentBefore) / remainingDays)
 */
import {
  normalizeContainerPeriodMode,
  resolveContainerPeriodAmountMinor,
  resolveContainerMonthlyAmountMinor,
  daysInPeriod,
  parseDayKey,
  dayKeyFromParts,
} from './budget-period.js'

export function normalizeContainerSurplusMode(value, options = {}) {
  const mode = String(value ?? '').trim()
  if (mode === 'save') return 'save'
  if (mode === 'roll') return 'roll'
  const budgetSaveEnabled = options.budgetSaveEnabled === true
    || options.budgetSaveEnabled === 1
    || options.budgetSaveEnabled === '1'
    || Number(options.budgetSaveEnabled ?? 0) === 1
  return budgetSaveEnabled ? 'save' : 'roll'
}

export function resolvePoolRemainingDays(period, dayKey) {
  const start = parseDayKey(period?.startDate)
  const end = parseDayKey(period?.endDate)
  const day = parseDayKey(dayKey)
  if (!start || !end || !day) return 1
  const startMs = Date.UTC(start.year, start.month - 1, start.day)
  const endMs = Date.UTC(end.year, end.month - 1, end.day)
  const dayMs = Date.UTC(day.year, day.month - 1, day.day)
  if (dayMs > endMs) return 0
  const effectiveStartMs = Math.max(startMs, dayMs)
  if (effectiveStartMs > endMs) return 0
  return Math.max(1, Math.round((endMs - effectiveStartMs) / 86400000) + 1)
}

export function resolvePoolPeriodBudgetMinor(container, period) {
  if (period?.startDate && period?.endDate) {
    return resolveContainerPeriodAmountMinor(container, period)
  }
  const monthKey = period?.monthKey ?? period?.key
  return resolveContainerMonthlyAmountMinor(container, monthKey)
}

export function resolvePoolTodayAllowanceMinor({
  periodBudgetMinor = 0,
  spentBeforeMinor = 0,
  remainingDays = 1,
} = {}) {
  const days = Math.max(1, Math.trunc(Number(remainingDays)) || 1)
  const remaining = Math.max(0, Math.round(Number(periodBudgetMinor) || 0) - Math.round(Number(spentBeforeMinor) || 0))
  return Math.floor(remaining / days)
}

export function resolvePoolStatsForDate({
  container,
  period,
  spentPeriodMinor = 0,
  spentOnDayMinor = 0,
  dayKey,
} = {}) {
  const periodBudgetMinor = resolvePoolPeriodBudgetMinor(container, period)
  const spentPeriod = Math.max(0, Math.round(Number(spentPeriodMinor) || 0))
  const spentOnDay = Math.max(0, Math.round(Number(spentOnDayMinor) || 0))
  const spentBeforeMinor = Math.max(0, spentPeriod - spentOnDay)
  const remainingDays = resolvePoolRemainingDays(period, dayKey)
  const todayAllowanceMinor = remainingDays > 0
    ? resolvePoolTodayAllowanceMinor({
      periodBudgetMinor,
      spentBeforeMinor,
      remainingDays,
    })
    : 0
  const todayRemainMinor = todayAllowanceMinor - spentOnDay
  const periodRemainMinor = periodBudgetMinor - spentPeriod
  const surplusMode = normalizeContainerSurplusMode(
    container?.surplus_mode ?? container?.surplusMode,
    { budgetSaveEnabled: container?.budget_save_enabled ?? container?.budgetSaveEnabled },
  )

  return {
    surplusMode,
    periodMode: normalizeContainerPeriodMode(container?.period_mode ?? container?.periodMode),
    periodBudgetMinor,
    spentPeriodMinor: spentPeriod,
    spentBeforeMinor,
    spentOnDayMinor: spentOnDay,
    remainingDays,
    todayAllowanceMinor,
    todayRemainMinor,
    periodRemainMinor,
    // Display budget for pool cards: today's rolling allowance
    budgetMinor: todayAllowanceMinor,
    spentMinor: spentOnDay,
    remainMinor: todayRemainMinor,
    isOver: todayAllowanceMinor > 0 && spentOnDay > todayAllowanceMinor,
    isPeriodOver: periodBudgetMinor > 0 && spentPeriod > periodBudgetMinor,
  }
}

export function resolvePoolReservedMinor({
  container,
  period,
  spentPeriodMinor = 0,
  spentOnDayMinor = 0,
  remainingDaysInclusive = 0,
  includeReferenceDay = true,
} = {}) {
  const surplusMode = normalizeContainerSurplusMode(
    container?.surplus_mode ?? container?.surplusMode,
    { budgetSaveEnabled: container?.budget_save_enabled ?? container?.budgetSaveEnabled },
  )
  const periodMode = normalizeContainerPeriodMode(container?.period_mode ?? container?.periodMode)
  const amountMinor = Math.max(0, Math.round(Number(container?.amount_minor ?? 0) || 0))

  // save + daily: keep fixed daily rate × remaining days (surplus leaves via budget-save)
  if (surplusMode === 'save' && periodMode === 'daily') {
    if (remainingDaysInclusive <= 0 || amountMinor <= 0) return 0
    return amountMinor * remainingDaysInclusive
  }

  const periodBudgetMinor = resolvePoolPeriodBudgetMinor(container, period)
  const spentPeriod = Math.max(0, Math.round(Number(spentPeriodMinor) || 0))
  const spentOnDay = Math.max(0, Math.round(Number(spentOnDayMinor) || 0))
  const spentBeforeMinor = Math.max(0, spentPeriod - spentOnDay)
  const remainingDays = Math.max(0, Math.trunc(Number(remainingDaysInclusive)) || 0)
  if (remainingDays <= 0) return 0

  const todayAllowanceMinor = resolvePoolTodayAllowanceMinor({
    periodBudgetMinor,
    spentBeforeMinor,
    remainingDays,
  })
  const potFromToday = Math.max(0, periodBudgetMinor - spentBeforeMinor)
  if (includeReferenceDay) return potFromToday
  return Math.max(0, potFromToday - todayAllowanceMinor)
}

export function dayKeyFromDateParts(parts) {
  if (!parts?.year || !parts?.month || !parts?.day) return ''
  return dayKeyFromParts(parts.year, parts.month, parts.day)
}

export function resolvePoolPeriodDays(period) {
  if (period?.startDate && period?.endDate) return daysInPeriod(period)
  return 30
}
