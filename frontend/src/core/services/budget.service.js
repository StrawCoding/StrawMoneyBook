import { createId, monthKeyFromDate } from '../utils/id.js'

const BUDGET_SAVE_PREFERENCES_KEY = 'budget_save_preferences'
const defaultDependencies = {
  async createBudget(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.createBudget(...args)
  },
  async deleteBudgetItem(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.deleteBudgetItem(...args)
  },
  async deleteBudgetItemsByBudget(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.deleteBudgetItemsByBudget(...args)
  },
  async deleteBudgetContainersByBudget(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.deleteBudgetContainersByBudget(...args)
  },
  async deleteBudgetContainer(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.deleteBudgetContainer(...args)
  },
  async listBudgetContainers(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.listBudgetContainers(...args)
  },
  async upsertBudgetContainer(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.upsertBudgetContainer(...args)
  },
  async getBudgetByMonth(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.getBudgetByMonth(...args)
  },
  async listBudgetUsageDaysByCategory(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.listBudgetUsageDaysByCategory(...args)
  },
  async listBudgetItems(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.listBudgetItems(...args)
  },
  async updateBudgetSaveTotalConfig(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.updateBudgetSaveTotalConfig(...args)
  },
  async upsertBudgetItem(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.upsertBudgetItem(...args)
  },
  async computeBudgetSpentByCategory(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.computeBudgetSpentByCategory(...args)
  },
  async findAccountById(...args) {
    const mod = await import('../repositories/account.repo.js')
    return mod.findAccountById(...args)
  },
  async isSavingsJarAccount(...args) {
    const mod = await import('../repositories/savings-jar.repo.js')
    return mod.isSavingsJarAccount(...args)
  },
  async getSetting(...args) {
    const mod = await import('../repositories/settings.repo.js')
    return mod.getSetting(...args)
  },
  async setSetting(...args) {
    const mod = await import('../repositories/settings.repo.js')
    return mod.setSetting(...args)
  },
}
const dependencies = { ...defaultDependencies }

export function resetBudgetServiceDependenciesForTest() {
  Object.assign(dependencies, defaultDependencies)
}

export function setBudgetServiceDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

function createBudgetError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function normalizeText(value) {
  return String(value ?? '').trim()
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

function countUsedOccurrencesByRule(usedDays, unit, values) {
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

function normalizeBudgetSaveEnabled(value) {
  return value === true || value === 1 || value === '1'
}

function normalizeBudgetSaveConfig(input = {}) {
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

function normalizeRetroactiveMode(value) {
  return normalizeText(value) === 'delta' ? 'delta' : 'manual'
}

function normalizeBudgetSavePreferences(raw = {}) {
  return {
    retroactiveMode: normalizeRetroactiveMode(raw?.retroactiveMode),
  }
}

async function assertValidBudgetSaveConfig(ledgerId, config) {
  if (!config.enabled) {
    return {
      enabled: false,
      targetAccountId: null,
      sourceAccountId: null,
    }
  }

  if (!config.targetAccountId) {
    throw createBudgetError('budgeting.budget_save.error.target_required')
  }
  if (!config.sourceAccountId) {
    throw createBudgetError('budgeting.budget_save.error.source_required')
  }
  if (config.targetAccountId === config.sourceAccountId) {
    throw createBudgetError('budgeting.budget_save.error.same_account')
  }

  const [targetAccount, sourceAccount, targetIsJar, sourceIsJar] = await Promise.all([
    dependencies.findAccountById(ledgerId, config.targetAccountId),
    dependencies.findAccountById(ledgerId, config.sourceAccountId),
    dependencies.isSavingsJarAccount(ledgerId, config.targetAccountId),
    dependencies.isSavingsJarAccount(ledgerId, config.sourceAccountId),
  ])

  if (!targetAccount || !targetIsJar) {
    throw createBudgetError('budgeting.budget_save.error.target_invalid')
  }
  if (!sourceAccount || sourceIsJar) {
    throw createBudgetError('budgeting.budget_save.error.source_invalid')
  }

  const targetCurrency = normalizeText(targetAccount.currency_code).toUpperCase()
  const sourceCurrency = normalizeText(sourceAccount.currency_code).toUpperCase()
  if (targetCurrency && sourceCurrency && targetCurrency !== sourceCurrency) {
    throw createBudgetError('budgeting.budget_save.error.currency_mismatch')
  }

  return {
    enabled: true,
    targetAccountId: config.targetAccountId,
    sourceAccountId: config.sourceAccountId,
  }
}

function resolveBudgetItemForMonth(item, monthKey, usedDays = []) {
  const amountMode = normalizeAmountMode(item?.amount_mode)
  const dayRuleUnit = amountMode === 'daily_average' ? normalizeDayRuleUnit(item?.day_rule_unit) : 'none'
  const dayRuleValues = amountMode === 'daily_average'
    ? normalizeDayRuleValues(item?.day_rule_values_json, dayRuleUnit)
    : []
  const baseAmountMinor = Math.max(0, Math.round(Number(item?.amount_minor ?? 0)))
  const occurrenceCount = amountMode === 'daily_average'
    ? countDailyRuleOccurrences(monthKey, dayRuleUnit, dayRuleValues)
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
  let budget = await dependencies.getBudgetByMonth(ledgerId, monthKey)
  if (!budget) {
    budget = await dependencies.createBudget(ledgerId, {
      monthKey,
      name: `${monthKey} 月預算`,
      includeTransfers: false,
      includeLoanRepayments: false,
      includeReimbursedExpenses: false,
      budgetSaveTotalEnabled: false,
      budgetSaveTotalTargetAccountId: null,
      budgetSaveTotalSourceAccountId: null,
    })
  }

  return budget
}

export async function getBudgetSavePreferences(ledgerId) {
  if (!ledgerId) {
    return normalizeBudgetSavePreferences()
  }
  const stored = await dependencies.getSetting(ledgerId, BUDGET_SAVE_PREFERENCES_KEY)
  return normalizeBudgetSavePreferences(stored)
}

export async function saveBudgetSavePreferences(ledgerId, input = {}) {
  if (!ledgerId) throw new Error('缺少帳本 ID')
  const normalized = normalizeBudgetSavePreferences(input)
  await dependencies.setSetting(ledgerId, BUDGET_SAVE_PREFERENCES_KEY, normalized)
  return normalized
}

export async function loadBudgetSnapshot(ledgerId, monthKey) {
  const budget = await ensureBudgetForMonth(ledgerId, monthKey)
  const { startUtc, endUtc } = monthRangeUtc(monthKey)
  const [rawItems, spentRows, usedOccurrenceRows, budgetSavePreferences, rawContainers] = await Promise.all([
    dependencies.listBudgetItems(ledgerId, budget.id),
    dependencies.computeBudgetSpentByCategory(ledgerId, startUtc, endUtc),
    dependencies.listBudgetUsageDaysByCategory(ledgerId, startUtc, endUtc),
    getBudgetSavePreferences(ledgerId),
    dependencies.listBudgetContainers(ledgerId, budget.id),
  ])
  const usedDaysMap = new Map()
  for (const row of usedOccurrenceRows) {
    const categoryId = String(row?.category_id ?? '').trim()
    const occurredDay = String(row?.occurred_day ?? '').trim()
    if (!categoryId || !occurredDay) continue
    if (!usedDaysMap.has(categoryId)) {
      usedDaysMap.set(categoryId, [])
    }
    usedDaysMap.get(categoryId).push(occurredDay)
  }
  const items = rawItems.map((item) => resolveBudgetItemForMonth(item, monthKey, usedDaysMap.get(String(item?.category_id ?? '').trim()) ?? []))

  return {
    budget,
    items,
    containers: rawContainers,
    spentRows,
    budgetSavePreferences,
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

  const budgetSave = await assertValidBudgetSaveConfig(ledgerId, normalizeBudgetSaveConfig(payload))
  const budgetContainerId = normalizeText(payload.budgetContainerId) || null
  if (budgetSave.enabled) {
    if (budgetContainerId) {
      const containers = await dependencies.listBudgetContainers(ledgerId, budget.id)
      const parentContainer = containers.find((c) => String(c?.id ?? '') === String(budgetContainerId))
      if (parentContainer && normalizeBudgetSaveEnabled(parentContainer?.budget_save_enabled)) {
        throw createBudgetError('budgeting.budget_save.error.parent_conflict')
      }
    }
    const items = await dependencies.listBudgetItems(ledgerId, budget.id)
    const duplicateExists = items.some((item) => (
      String(item?.id ?? '') !== String(payload.id ?? '')
      && String(item?.category_id ?? '') === String(payload.categoryId ?? '')
    ))
    if (duplicateExists) {
      throw createBudgetError('budgeting.budget_save.error.conflict')
    }
  }

  if (budgetContainerId) {
    const containers = await dependencies.listBudgetContainers(ledgerId, budget.id)
    const container = containers.find((c) => String(c?.id ?? '') === String(budgetContainerId))
    if (!container) {
      throw createBudgetError('budgeting.container.error.not_found')
    }
  }

  const id = await dependencies.upsertBudgetItem(ledgerId, {
    id: payload.id,
    budgetId: budget.id,
    scopeType: 'category',
    categoryId: payload.categoryId,
    categoryGroupId: null,
    budgetContainerId,
    amountMinor,
    amountMode,
    dayRuleUnit,
    dayRuleValuesJson: JSON.stringify(dayRuleValues),
    budgetSaveEnabled: budgetSave.enabled,
    budgetSaveTargetAccountId: budgetSave.targetAccountId,
    budgetSaveSourceAccountId: budgetSave.sourceAccountId,
    sortOrder: payload.sortOrder ?? 0,
  })

  return id
}

export async function saveBudgetTotalConfig(ledgerId, monthKey, payload = {}) {
  const budget = await ensureBudgetForMonth(ledgerId, monthKey)
  const budgetSave = await assertValidBudgetSaveConfig(ledgerId, normalizeBudgetSaveConfig(payload))
  await dependencies.updateBudgetSaveTotalConfig(ledgerId, budget.id, {
    enabled: budgetSave.enabled,
    targetAccountId: budgetSave.targetAccountId,
    sourceAccountId: budgetSave.sourceAccountId,
  })
  return dependencies.getBudgetByMonth(ledgerId, monthKey)
}

export async function saveBudgetContainer(ledgerId, monthKey, payload) {
  const budget = await ensureBudgetForMonth(ledgerId, monthKey)
  const name = normalizeText(payload.name)
  if (!name) {
    throw createBudgetError('budgeting.container.error.name_required')
  }

  const budgetSave = await assertValidBudgetSaveConfig(ledgerId, normalizeBudgetSaveConfig(payload))
  if (budgetSave.enabled) {
    const items = await dependencies.listBudgetItems(ledgerId, budget.id)
    const hasConflict = items.some((item) => (
      String(item?.budget_container_id ?? '') === String(payload.id ?? '')
      && normalizeBudgetSaveEnabled(item?.budget_save_enabled)
    ))
    if (hasConflict) {
      throw createBudgetError('budgeting.budget_save.error.group_conflict')
    }
  }

  return dependencies.upsertBudgetContainer(ledgerId, {
    id: payload.id,
    budgetId: budget.id,
    name,
    amountMinor: Math.max(0, Math.round(Number(payload.amountMinor))),
    budgetSaveEnabled: budgetSave.enabled,
    budgetSaveTargetAccountId: budgetSave.targetAccountId,
    budgetSaveSourceAccountId: budgetSave.sourceAccountId,
    sortOrder: payload.sortOrder ?? 0,
  })
}

export async function removeBudgetItem(ledgerId, budgetItemId) {
  if (!budgetItemId) return
  await dependencies.deleteBudgetItem(ledgerId, budgetItemId)
}

export async function removeBudgetContainer(ledgerId, containerId) {
  if (!containerId) return
  await dependencies.deleteBudgetContainer(ledgerId, containerId)
}

export async function copyPreviousMonthBudget(ledgerId, monthKey, options = {}) {
  const currentBudget = await ensureBudgetForMonth(ledgerId, monthKey)
  const prevKey = previousMonthKey(monthKey)
  const prevBudget = await dependencies.getBudgetByMonth(ledgerId, prevKey)

  if (!prevBudget) {
    return { copied: 0, fromMonth: prevKey }
  }

  const [prevItems, prevContainers] = await Promise.all([
    dependencies.listBudgetItems(ledgerId, prevBudget.id),
    dependencies.listBudgetContainers(ledgerId, prevBudget.id),
  ])

  if (options.replaceExisting !== false) {
    await dependencies.deleteBudgetItemsByBudget(ledgerId, currentBudget.id)
    await dependencies.deleteBudgetContainersByBudget(ledgerId, currentBudget.id)
  }

  const containerIdMap = new Map()
  for (const [index, container] of prevContainers.entries()) {
    const newId = createId('bc')
    containerIdMap.set(container.id, newId)
    await dependencies.upsertBudgetContainer(ledgerId, {
      id: newId,
      budgetId: currentBudget.id,
      name: container.name,
      amountMinor: Number(container.amount_minor),
      budgetSaveEnabled: Number(container.budget_save_enabled ?? 0) === 1,
      budgetSaveTargetAccountId: container.budget_save_target_account_id,
      budgetSaveSourceAccountId: container.budget_save_source_account_id,
      sortOrder: index,
    })
  }

  for (const [index, item] of prevItems.entries()) {
    const newContainerId = item.budget_container_id
      ? (containerIdMap.get(item.budget_container_id) ?? item.budget_container_id)
      : null
    await dependencies.upsertBudgetItem(ledgerId, {
      id: createId('bi'),
      budgetId: currentBudget.id,
      scopeType: item.scope_type,
      categoryId: item.category_id,
      categoryGroupId: item.category_group_id,
      budgetContainerId: newContainerId,
      amountMinor: Number(item.amount_minor),
      amountMode: normalizeAmountMode(item.amount_mode),
      dayRuleUnit: normalizeDayRuleUnit(item.day_rule_unit),
      dayRuleValuesJson: JSON.stringify(normalizeDayRuleValues(item.day_rule_values_json, normalizeDayRuleUnit(item.day_rule_unit))),
      budgetSaveEnabled: Number(item.budget_save_enabled ?? 0) === 1,
      budgetSaveTargetAccountId: item.budget_save_target_account_id,
      budgetSaveSourceAccountId: item.budget_save_source_account_id,
      sortOrder: index,
    })
  }

  await dependencies.updateBudgetSaveTotalConfig(ledgerId, currentBudget.id, {
    enabled: Number(prevBudget.budget_save_total_enabled ?? 0) === 1,
    targetAccountId: prevBudget.budget_save_total_target_account_id,
    sourceAccountId: prevBudget.budget_save_total_source_account_id,
  })

  return {
    copied: prevItems.length + prevContainers.length,
    fromMonth: prevKey,
  }
}
