import {
  normalizeContainerSurplusMode,
  resolvePoolReservedMinor,
} from './budget-pool-daily.js'

const FALLBACK_LEDGER_TIME_ZONE = 'Asia/Taipei'

function normalizeTimeZone(value) {
  const timeZone = String(value ?? '').trim()
  if (!timeZone) return FALLBACK_LEDGER_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date('2026-01-01T00:00:00.000Z'))
    return timeZone
  } catch {
    return FALLBACK_LEDGER_TIME_ZONE
  }
}

function normalizeAmountMode(value) {
  return String(value ?? '').trim() === 'daily_average' ? 'daily_average' : 'fixed'
}

function normalizeDayRuleUnit(value) {
  const normalized = String(value ?? '').trim()
  if (normalized === 'weekday' || normalized === 'monthday') return normalized
  return 'none'
}

function normalizeDayRuleValues(rawValues, unit) {
  const rawList = Array.isArray(rawValues)
    ? rawValues
    : (typeof rawValues === 'string'
      ? (() => {
        try {
          const parsed = JSON.parse(rawValues)
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      })()
      : [])
  const max = unit === 'monthday' ? 31 : 7
  return Array.from(
    new Set(
      rawList
        .map((value) => Math.trunc(Number(value)))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= max),
    ),
  ).sort((a, b) => a - b)
}

function parseMonthKey(monthKey) {
  const matched = /^(\d{4})-(\d{2})$/.exec(String(monthKey ?? '').trim())
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
  return { year, month }
}

function normalizeContainerPeriodMode(value) {
  return String(value ?? '').trim() === 'daily' ? 'daily' : 'monthly'
}

export function getDatePartsInTimeZone(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const year = Number(map.year)
  const month = Number(map.month)
  const day = Number(map.day)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  return { year, month, day }
}

function countMatchingRuleDaysInMonth(year, month, unit, values) {
  if (unit === 'none' || !Array.isArray(values) || values.length <= 0) return 0
  const lastDate = new Date(year, month, 0).getDate()
  if (!Number.isFinite(lastDate) || lastDate <= 0) return 0

  if (unit === 'monthday') {
    return values.filter((value) => value >= 1 && value <= lastDate).length
  }

  const valueSet = new Set(values)
  let total = 0
  for (let day = 1; day <= lastDate; day += 1) {
    const date = new Date(year, month - 1, day)
    const weekday = date.getDay() === 0 ? 7 : date.getDay()
    if (valueSet.has(weekday)) total += 1
  }
  return total
}

function countPendingRuleDays(item, monthKey, referenceDate, timeZone, options = {}) {
  if (normalizeAmountMode(item?.amount_mode) !== 'daily_average') return 0
  const monthInfo = parseMonthKey(monthKey)
  const referenceParts = getDatePartsInTimeZone(referenceDate, timeZone)
  if (!monthInfo || !referenceParts) return 0

  const unit = normalizeDayRuleUnit(item?.day_rule_unit)
  const values = normalizeDayRuleValues(item?.day_rule_values ?? item?.day_rule_values_json, unit)
  if (unit === 'none' || values.length <= 0) return 0

  const monthSortKey = monthInfo.year * 100 + monthInfo.month
  const referenceSortKey = referenceParts.year * 100 + referenceParts.month
  if (monthSortKey < referenceSortKey) return 0
  if (monthSortKey > referenceSortKey) {
    return countMatchingRuleDaysInMonth(monthInfo.year, monthInfo.month, unit, values)
  }

  const lastDate = new Date(monthInfo.year, monthInfo.month, 0).getDate()
  const startDay = options.includeReferenceDay === false ? referenceParts.day + 1 : referenceParts.day
  if (startDay > lastDate) return 0

  if (unit === 'monthday') {
    return values.filter((value) => value >= startDay && value <= lastDate).length
  }

  const valueSet = new Set(values)
  let total = 0
  for (let day = Math.max(1, startDay); day <= lastDate; day += 1) {
    const date = new Date(monthInfo.year, monthInfo.month - 1, day)
    const weekday = date.getDay() === 0 ? 7 : date.getDay()
    if (valueSet.has(weekday)) total += 1
  }
  return total
}

function parseDayKey(dayKey) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey ?? '').trim())
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const date = new Date(year, month - 1, day)
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null
  return { year, month, day }
}

function daySortKey(parts) {
  return parts.year * 10000 + parts.month * 100 + parts.day
}

function countMatchingRuleDaysInRange(startDate, endDate, unit, values, minDate = startDate) {
  const start = parseDayKey(startDate)
  const end = parseDayKey(endDate)
  const min = parseDayKey(minDate)
  if (!start || !end || !min || unit === 'none' || !Array.isArray(values) || values.length <= 0) return 0
  const startMs = Date.UTC(start.year, start.month - 1, start.day)
  const endMs = Date.UTC(end.year, end.month - 1, end.day)
  if (endMs < startMs) return 0
  const minKey = daySortKey(min)
  const valueSet = new Set(values)
  let total = 0
  for (let ms = startMs; ms <= endMs; ms += 86400000) {
    const date = new Date(ms)
    const parts = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
    if (daySortKey(parts) < minKey) continue
    if (unit === 'monthday') {
      if (valueSet.has(parts.day)) total += 1
      continue
    }
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
    if (valueSet.has(weekday)) total += 1
  }
  return total
}

function countPendingRuleDaysInPeriod(item, period, referenceDate, timeZone, options = {}) {
  if (normalizeAmountMode(item?.amount_mode) !== 'daily_average') return 0
  const referenceParts = getDatePartsInTimeZone(referenceDate, timeZone)
  if (!period?.startDate || !period?.endDate || !referenceParts) return 0

  const unit = normalizeDayRuleUnit(item?.day_rule_unit)
  const values = normalizeDayRuleValues(item?.day_rule_values ?? item?.day_rule_values_json, unit)
  if (unit === 'none' || values.length <= 0) return 0

  const referenceKey = `${referenceParts.year}-${String(referenceParts.month).padStart(2, '0')}-${String(referenceParts.day).padStart(2, '0')}`
  const minDate = options.includeReferenceDay === false
    ? new Date(Date.UTC(referenceParts.year, referenceParts.month - 1, referenceParts.day + 1)).toISOString().slice(0, 10)
    : referenceKey
  const start = parseDayKey(period.startDate)
  const end = parseDayKey(period.endDate)
  const reference = parseDayKey(minDate)
  if (!start || !end || !reference) return 0
  if (daySortKey(reference) > daySortKey(end)) return 0
  return countMatchingRuleDaysInRange(
    period.startDate,
    period.endDate,
    unit,
    values,
    daySortKey(reference) > daySortKey(start) ? minDate : period.startDate,
  )
}

export function countRemainingCalendarDaysInMonth(monthKey, referenceDate, timeZone, options = {}) {
  const monthInfo = parseMonthKey(monthKey)
  const referenceParts = getDatePartsInTimeZone(referenceDate, timeZone)
  if (!monthInfo || !referenceParts) return 0

  const daysInMonth = new Date(monthInfo.year, monthInfo.month, 0).getDate()
  const monthSortKey = monthInfo.year * 100 + monthInfo.month
  const referenceSortKey = referenceParts.year * 100 + referenceParts.month
  if (monthSortKey < referenceSortKey) return 0
  if (monthSortKey > referenceSortKey) return daysInMonth

  const startDay = options.includeReferenceDay === false
    ? referenceParts.day + 1
    : referenceParts.day
  if (startDay > daysInMonth) return 0
  return daysInMonth - startDay + 1
}

export function countRemainingCalendarDaysInPeriod(period, referenceDate, timeZone, options = {}) {
  const start = parseDayKey(period?.startDate)
  const end = parseDayKey(period?.endDate)
  const referenceParts = getDatePartsInTimeZone(referenceDate, timeZone)
  if (!start || !end || !referenceParts) return 0
  const referenceKey = options.includeReferenceDay === false
    ? new Date(Date.UTC(referenceParts.year, referenceParts.month - 1, referenceParts.day + 1)).toISOString().slice(0, 10)
    : `${referenceParts.year}-${String(referenceParts.month).padStart(2, '0')}-${String(referenceParts.day).padStart(2, '0')}`
  const min = parseDayKey(referenceKey)
  if (!min) return 0
  const startMs = Date.UTC(start.year, start.month - 1, start.day)
  const endMs = Date.UTC(end.year, end.month - 1, end.day)
  const minMs = Date.UTC(min.year, min.month - 1, min.day)
  const effectiveStartMs = Math.max(startMs, minMs)
  if (effectiveStartMs > endMs) return 0
  return Math.round((endMs - effectiveStartMs) / 86400000) + 1
}

function toFiniteMinor(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return numeric
}

function sumContainerSpent(container, items = [], spentMap = {}) {
  const containerId = String(container?.id ?? '')
  return (items ?? []).reduce((total, item) => {
    if (String(item?.budget_container_id ?? '') !== containerId) return total
    const categoryId = String(item?.category_id ?? '').trim()
    if (!categoryId) return total
    return total + toFiniteMinor(spentMap?.[categoryId])
  }, 0)
}

export function computeDailyPoolReservedMinor(containers = [], monthKey, referenceDate, timeZone, options = {}) {
  const remainingDays = countRemainingCalendarDaysInMonth(monthKey, referenceDate, timeZone, options)
  if (remainingDays <= 0) return 0
  const period = options.period ?? {
    key: monthKey,
    monthKey,
    startDate: `${monthKey}-01`,
    endDate: `${monthKey}-${String(new Date(
      Number(String(monthKey).slice(0, 4)),
      Number(String(monthKey).slice(5, 7)),
      0,
    ).getDate()).padStart(2, '0')}`,
  }
  const items = options.items ?? []
  const spentMap = options.spentMap ?? {}
  const todaySpentMap = options.todaySpentMap ?? {}

  return (containers ?? []).reduce((total, container) => {
    const periodMode = normalizeContainerPeriodMode(container?.period_mode)
    const surplusMode = normalizeContainerSurplusMode(
      container?.surplus_mode ?? container?.surplusMode,
      { budgetSaveEnabled: container?.budget_save_enabled ?? container?.budgetSaveEnabled },
    )
    // Only daily pools used to contribute; rolling monthly pools now also reserve.
    if (periodMode !== 'daily' && surplusMode === 'save') return total

    const spentPeriodMinor = sumContainerSpent(container, items, spentMap)
    const spentOnDayMinor = sumContainerSpent(container, items, todaySpentMap)
    return total + resolvePoolReservedMinor({
      container,
      period,
      spentPeriodMinor,
      spentOnDayMinor,
      remainingDaysInclusive: remainingDays,
      includeReferenceDay: options.includeReferenceDay !== false,
    })
  }, 0)
}

export function computeDailyPoolReservedMinorForPeriod(containers = [], period, referenceDate, timeZone, options = {}) {
  const remainingDays = countRemainingCalendarDaysInPeriod(period, referenceDate, timeZone, options)
  if (remainingDays <= 0) return 0
  const items = options.items ?? []
  const spentMap = options.spentMap ?? {}
  const todaySpentMap = options.todaySpentMap ?? {}

  return (containers ?? []).reduce((total, container) => {
    const periodMode = normalizeContainerPeriodMode(container?.period_mode)
    const surplusMode = normalizeContainerSurplusMode(
      container?.surplus_mode ?? container?.surplusMode,
      { budgetSaveEnabled: container?.budget_save_enabled ?? container?.budgetSaveEnabled },
    )
    // Daily pools always reserve; monthly pools only when rolling surplus back into the pool.
    if (periodMode !== 'daily' && surplusMode !== 'roll') return total

    const spentPeriodMinor = sumContainerSpent(container, items, spentMap)
    const spentOnDayMinor = sumContainerSpent(container, items, todaySpentMap)
    return total + resolvePoolReservedMinor({
      container,
      period,
      spentPeriodMinor,
      spentOnDayMinor,
      remainingDaysInclusive: remainingDays,
      includeReferenceDay: options.includeReferenceDay !== false,
    })
  }, 0)
}

export function computeReservedMinor(items = [], monthKey, referenceDate = new Date(), timeZone, options = {}) {
  return (items ?? []).reduce((total, item) => {
    const amountMinor = Math.max(0, Math.round(Number(item?.amount_minor ?? 0) || 0))
    if (amountMinor <= 0) return total
    const pendingCount = countPendingRuleDays(item, monthKey, referenceDate, timeZone, options)
    return total + (amountMinor * pendingCount)
  }, 0)
}

export function computeMonthlyReservedMinor(
  items = [],
  containers = [],
  monthKey,
  referenceDate = new Date(),
  timeZone,
  options = {},
) {
  const dailyAverageReserved = computeReservedMinor(items, monthKey, referenceDate, timeZone, options)
  const dailyPoolReserved = computeDailyPoolReservedMinor(containers, monthKey, referenceDate, timeZone, options)
  return dailyAverageReserved + dailyPoolReserved
}

export function computePeriodReservedMinor(
  items = [],
  containers = [],
  period,
  referenceDate = new Date(),
  timeZone,
  options = {},
) {
  if (!period?.startDate || !period?.endDate) {
    return computeMonthlyReservedMinor(items, containers, period?.monthKey ?? period?.key, referenceDate, timeZone, options)
  }
  const dailyAverageReserved = (items ?? []).reduce((total, item) => {
    const amountMinor = Math.max(0, Math.round(Number(item?.amount_minor ?? 0) || 0))
    if (amountMinor <= 0) return total
    return total + (amountMinor * countPendingRuleDaysInPeriod(item, period, referenceDate, timeZone, options))
  }, 0)
  const dailyPoolReserved = computeDailyPoolReservedMinorForPeriod(containers, period, referenceDate, timeZone, options)
  return dailyAverageReserved + dailyPoolReserved
}
