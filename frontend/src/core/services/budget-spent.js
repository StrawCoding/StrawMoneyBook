/**
 * ART-18 — Budget item amount resolution / daily-rule occurrence counting.
 */
import {
  daysInPeriod,
  normalizeAmountMode,
  normalizeText,
  parseDayKey,
  parseMonthKey,
  resolveCalendarBudgetPeriod,
  getZonedDateParts,
  normalizeLedgerTimeZone,
} from './budget-period.js'

export function normalizeDayRuleUnit(value) {
  if (value === 'weekday') return 'weekday'
  if (value === 'monthday') return 'monthday'
  return 'none'
}

export function normalizeDayRuleValues(rawValues, unit) {
  let parsed = rawValues
  if (typeof rawValues === 'string') {
    try {
      parsed = JSON.parse(rawValues)
    } catch {
      parsed = []
    }
  }

  if (!Array.isArray(parsed)) return []

  const max = unit === 'monthday' ? 31 : 7
  const min = 1
  return Array.from(
    new Set(
      parsed
        .map((value) => Math.trunc(Number(value)))
        .filter((value) => Number.isFinite(value) && value >= min && value <= max),
    ),
  ).sort((a, b) => a - b)
}

export function countDailyRuleOccurrencesInRange(startDate, endDate, unit, values) {
  const start = parseDayKey(startDate)
  const end = parseDayKey(endDate)
  if (!start || !end || unit === 'none' || !Array.isArray(values) || !values.length) return 0
  const startMs = Date.UTC(start.year, start.month - 1, start.day)
  const endMs = Date.UTC(end.year, end.month - 1, end.day)
  if (endMs < startMs) return 0
  const valueSet = new Set(values)
  let total = 0
  for (let ms = startMs; ms <= endMs; ms += 86400000) {
    const date = new Date(ms)
    if (unit === 'monthday') {
      if (valueSet.has(date.getUTCDate())) total += 1
      continue
    }
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
    if (valueSet.has(weekday)) total += 1
  }
  return total
}

export function countDailyRuleOccurrences(monthKey, unit, values) {
  if (!monthKey || unit === 'none' || !Array.isArray(values) || !values.length) return 0

  const [year, month] = String(monthKey).split('-').map((part) => Number(part))
  if (!year || !month) return 0

  const lastDate = new Date(year, month, 0).getDate()
  if (!Number.isFinite(lastDate) || lastDate <= 0) return 0

  const valueSet = new Set(values)
  if (unit === 'monthday') {
    let total = 0
    for (const value of valueSet) {
      if (value >= 1 && value <= lastDate) total += 1
    }
    return total
  }

  let total = 0
  for (let day = 1; day <= lastDate; day += 1) {
    const date = new Date(year, month - 1, day)
    const weekday = date.getDay() === 0 ? 7 : date.getDay()
    if (valueSet.has(weekday)) total += 1
  }
  return total
}

export function countUsedOccurrencesByRule(usedDays, unit, values) {
  if (!Array.isArray(usedDays) || !usedDays.length || unit === 'none' || !Array.isArray(values) || !values.length) return 0
  const ruleValues = new Set(values.map((value) => Number(value)))
  let count = 0

  for (const dayText of usedDays) {
    const date = new Date(`${dayText}T00:00:00`)
    if (Number.isNaN(date.getTime())) continue
    if (unit === 'monthday') {
      if (ruleValues.has(date.getDate())) count += 1
      continue
    }
    const weekday = date.getDay() === 0 ? 7 : date.getDay()
    if (ruleValues.has(weekday)) count += 1
  }

  return count
}

export function normalizeBudgetSaveEnabled(value) {
  return value === true || value === 1 || value === '1'
}

export function normalizeBudgetSaveConfig(input = {}) {
  const enabled = normalizeBudgetSaveEnabled(input.enabled ?? input.budgetSaveEnabled)
  if (!enabled) {
    return {
      enabled: false,
      targetAccountId: null,
      sourceAccountId: null,
    }
  }
  return {
    enabled: true,
    targetAccountId: normalizeText(input.targetAccountId ?? input.budgetSaveTargetAccountId),
    sourceAccountId: normalizeText(input.sourceAccountId ?? input.budgetSaveSourceAccountId),
  }
}

export function normalizeRetroactiveMode(value) {
  return normalizeText(value) === 'delta' ? 'delta' : 'manual'
}

export function normalizeBudgetSavePreferences(raw = {}) {
  return {
    retroactiveMode: normalizeRetroactiveMode(raw?.retroactiveMode),
  }
}
export function resolveBudgetItemForPeriod(item, period, usedDays = []) {
  const amountMode = normalizeAmountMode(item?.amount_mode)
  const dayRuleUnit = amountMode === 'daily_average' ? normalizeDayRuleUnit(item?.day_rule_unit) : 'none'
  const dayRuleValues = amountMode === 'daily_average'
    ? normalizeDayRuleValues(item?.day_rule_values_json, dayRuleUnit)
    : []
  const baseAmountMinor = Math.max(0, Math.round(Number(item?.amount_minor ?? 0)))
  const occurrenceCount = amountMode === 'daily_average'
    ? countDailyRuleOccurrencesInRange(period.startDate, period.endDate, dayRuleUnit, dayRuleValues)
    : 0
  const usedOccurrenceCount = amountMode === 'daily_average'
    ? countUsedOccurrencesByRule(usedDays, dayRuleUnit, dayRuleValues)
    : 0
  const resolvedAmountMinor = amountMode === 'daily_average'
    ? baseAmountMinor * occurrenceCount
    : baseAmountMinor

  return {
    ...item,
    amount_mode: amountMode,
    day_rule_unit: dayRuleUnit,
    day_rule_values_json: JSON.stringify(dayRuleValues),
    day_rule_values: dayRuleValues,
    occurrence_count: occurrenceCount,
    used_occurrence_count: usedOccurrenceCount,
    resolved_amount_minor: resolvedAmountMinor,
    budget_save_enabled: Number(item?.budget_save_enabled ?? 0) === 1,
  }
}

export function resolveBudgetItemForMonth(item, monthKey, usedDays = []) {
  const period = resolveCalendarBudgetPeriod(monthKey)
  return resolveBudgetItemForPeriod(item, period, usedDays)
}
