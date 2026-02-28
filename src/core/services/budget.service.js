import { createId, monthKeyFromDate } from '@/core/utils/id'
import {
  createBudget,
  deleteBudgetItem,
  deleteBudgetItemsByBudget,
  getBudgetByMonth,
  listBudgetItems,
  upsertBudgetItem,
  computeBudgetSpentByCategory,
} from '@/core/repositories/budget.repo'

function createBudgetError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function normalizeAmountMode(value) {
  return value === 'daily_average' ? 'daily_average' : 'fixed'
}

function normalizeDayRuleUnit(value) {
  if (value === 'weekday') return 'weekday'
  if (value === 'monthday') return 'monthday'
  return 'none'
}

function normalizeDayRuleValues(rawValues, unit) {
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

function countDailyRuleOccurrences(monthKey, unit, values) {
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

function resolveBudgetItemForMonth(item, monthKey) {
  const amountMode = normalizeAmountMode(item?.amount_mode)
  const dayRuleUnit = amountMode === 'daily_average' ? normalizeDayRuleUnit(item?.day_rule_unit) : 'none'
  const dayRuleValues = amountMode === 'daily_average'
    ? normalizeDayRuleValues(item?.day_rule_values_json, dayRuleUnit)
    : []
  const baseAmountMinor = Math.max(0, Math.round(Number(item?.amount_minor ?? 0)))
  const occurrenceCount = amountMode === 'daily_average'
    ? countDailyRuleOccurrences(monthKey, dayRuleUnit, dayRuleValues)
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
    resolved_amount_minor: resolvedAmountMinor,
  }
}

export function monthRangeUtc(monthKey) {
  const [year, month] = monthKey.split('-').map((part) => Number(part))
  const start = new Date(year, month - 1, 1, 0, 0, 0)
  const end = new Date(year, month, 1, 0, 0, 0)

  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  }
}

export function previousMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map((part) => Number(part))
  const date = new Date(year, month - 2, 1)
  return monthKeyFromDate(date)
}

export async function ensureBudgetForMonth(ledgerId, monthKey) {
  let budget = await getBudgetByMonth(ledgerId, monthKey)
  if (!budget) {
    budget = await createBudget(ledgerId, {
      monthKey,
      name: `${monthKey} 月預算`,
      includeTransfers: false,
      includeLoanRepayments: false,
      includeReimbursedExpenses: false,
    })
  }

  return budget
}

export async function loadBudgetSnapshot(ledgerId, monthKey) {
  const budget = await ensureBudgetForMonth(ledgerId, monthKey)
  const items = (await listBudgetItems(ledgerId, budget.id))
    .map((item) => resolveBudgetItemForMonth(item, monthKey))
  const { startUtc, endUtc } = monthRangeUtc(monthKey)
  const spentRows = await computeBudgetSpentByCategory(ledgerId, startUtc, endUtc)

  return {
    budget,
    items,
    spentRows,
  }
}

export async function saveBudgetItem(ledgerId, monthKey, payload) {
  const budget = await ensureBudgetForMonth(ledgerId, monthKey)

  if (!payload.categoryId) {
    throw createBudgetError('budgeting.error.category_required')
  }

  const amountMinor = Math.max(0, Math.round(Number(payload.amountMinor)))
  const amountMode = normalizeAmountMode(payload.amountMode)
  const dayRuleUnit = amountMode === 'daily_average' ? normalizeDayRuleUnit(payload.dayRuleUnit) : 'none'
  const dayRuleValues = amountMode === 'daily_average' ? normalizeDayRuleValues(payload.dayRuleValues, dayRuleUnit) : []

  if (amountMode === 'daily_average') {
    if (dayRuleUnit === 'none') {
      throw createBudgetError('budgeting.error.rule_unit_required')
    }
    if (!dayRuleValues.length) {
      throw createBudgetError('budgeting.error.rule_values_required')
    }
  }

  const id = await upsertBudgetItem(ledgerId, {
    id: payload.id,
    budgetId: budget.id,
    scopeType: 'category',
    categoryId: payload.categoryId,
    categoryGroupId: null,
    amountMinor,
    amountMode,
    dayRuleUnit,
    dayRuleValuesJson: JSON.stringify(dayRuleValues),
    sortOrder: payload.sortOrder ?? 0,
  })

  return id
}

export async function removeBudgetItem(ledgerId, budgetItemId) {
  if (!budgetItemId) return
  await deleteBudgetItem(ledgerId, budgetItemId)
}

export async function copyPreviousMonthBudget(ledgerId, monthKey, options = {}) {
  const currentBudget = await ensureBudgetForMonth(ledgerId, monthKey)
  const prevKey = previousMonthKey(monthKey)
  const prevBudget = await getBudgetByMonth(ledgerId, prevKey)

  if (!prevBudget) {
    return { copied: 0, fromMonth: prevKey }
  }

  const prevItems = await listBudgetItems(ledgerId, prevBudget.id)

  if (options.replaceExisting !== false) {
    await deleteBudgetItemsByBudget(ledgerId, currentBudget.id)
  }

  for (const [index, item] of prevItems.entries()) {
    await upsertBudgetItem(ledgerId, {
      id: createId('bi'),
      budgetId: currentBudget.id,
      scopeType: item.scope_type,
      categoryId: item.category_id,
      categoryGroupId: item.category_group_id,
      amountMinor: Number(item.amount_minor),
      amountMode: normalizeAmountMode(item.amount_mode),
      dayRuleUnit: normalizeDayRuleUnit(item.day_rule_unit),
      dayRuleValuesJson: JSON.stringify(normalizeDayRuleValues(item.day_rule_values_json, normalizeDayRuleUnit(item.day_rule_unit))),
      sortOrder: index,
    })
  }

  return {
    copied: prevItems.length,
    fromMonth: prevKey,
  }
}
