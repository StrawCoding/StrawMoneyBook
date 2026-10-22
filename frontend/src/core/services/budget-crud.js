/**
 * ART-18 — Budget CRUD / snapshot / ledger period settings (async use-cases).
 */
import { createId, monthKeyFromDate } from '../utils/id.js'
import { BUDGET_SAVE_PREFERENCES_KEY, dependencies } from './budget-deps.js'
import {
  createBudgetError,
  isBudgetPeriodConflict,
  normalizeText,
  normalizeAmountMode,
  normalizeContainerPeriodMode,
  parseMonthKey,
  parsePayCycleMonthKey,
  normalizeBudgetPeriodMode,
  normalizePayDay,
  normalizeLedgerTimeZone,
  resolveCalendarBudgetPeriod,
  resolveBudgetPeriodForLedger,
  resolveCurrentBudgetPeriodForLedger,
  listInclusiveMonthKeys,
  daysInPeriod,
  resolveContainerPeriodAmountMinor,
  isDailyPoolContainer,
  isDailyPoolChildItem,
  previousMonthKey,
  dateRangeUtc,
  todayRangeUtc,
  monthRangeUtc,
} from './budget-period.js'
import {
  normalizeContainerSurplusMode,
} from './budget-pool-daily.js'
import {
  normalizeDayRuleUnit,
  normalizeDayRuleValues,
  countDailyRuleOccurrences,
  countUsedOccurrencesByRule,
  normalizeBudgetSaveEnabled,
  normalizeBudgetSaveConfig,
  normalizeRetroactiveMode,
  normalizeBudgetSavePreferences,
  resolveBudgetItemForPeriod,
  resolveBudgetItemForMonth,
} from './budget-spent.js'

export function normalizeCategoryIdList(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeText(value))
        .filter(Boolean),
    ),
  )
}

export function buildBudgetItemWritePayloadFromRow(item) {
  const amountMode = normalizeAmountMode(item?.amount_mode)
  const dayRuleUnit = amountMode === 'daily_average'
    ? normalizeDayRuleUnit(item?.day_rule_unit)
    : 'none'
  return {
    id: item.id,
    budgetId: item.budget_id,
    scopeType: item.scope_type ?? 'category',
    categoryId: item.category_id ?? null,
    categoryGroupId: item.category_group_id ?? null,
    budgetContainerId: item.budget_container_id ?? null,
    amountMinor: Math.max(0, Math.round(Number(item?.amount_minor ?? 0))),
    amountMode,
    dayRuleUnit,
    dayRuleValuesJson: JSON.stringify(
      amountMode === 'daily_average'
        ? normalizeDayRuleValues(item?.day_rule_values ?? item?.day_rule_values_json, dayRuleUnit)
        : [],
    ),
    budgetSaveEnabled: normalizeBudgetSaveEnabled(item?.budget_save_enabled),
    budgetSaveTargetAccountId: item?.budget_save_target_account_id ?? null,
    budgetSaveSourceAccountId: item?.budget_save_source_account_id ?? null,
    sortOrder: item?.sort_order ?? 0,
  }
}

export async function syncDailyPoolCategoryItems(ledgerId, budgetId, containerId, categoryIds) {
  const normalizedCategoryIds = normalizeCategoryIdList(categoryIds)
  const items = await dependencies.listBudgetItems(ledgerId, budgetId)
  const selectedCategoryIdSet = new Set(normalizedCategoryIds)
  const existingByCategoryId = new Map()

  for (const item of items) {
    const categoryId = normalizeText(item?.category_id)
    if (!categoryId) continue
    if (!existingByCategoryId.has(categoryId)) {
      existingByCategoryId.set(categoryId, item)
      continue
    }
    const current = existingByCategoryId.get(categoryId)
    const currentInPool = String(current?.budget_container_id ?? '') === String(containerId)
    const nextInPool = String(item?.budget_container_id ?? '') === String(containerId)
    if (!currentInPool && nextInPool) {
      existingByCategoryId.set(categoryId, item)
    }
  }

  for (const categoryId of normalizedCategoryIds) {
    const existing = existingByCategoryId.get(categoryId)
    if (existing) {
      await dependencies.upsertBudgetItem(ledgerId, {
        id: existing.id,
        budgetId,
        scopeType: 'category',
        categoryId,
        categoryGroupId: null,
        budgetContainerId: containerId,
        amountMinor: 0,
        amountMode: 'fixed',
        dayRuleUnit: 'none',
        dayRuleValuesJson: '[]',
        budgetSaveEnabled: normalizeBudgetSaveEnabled(existing?.budget_save_enabled),
        budgetSaveTargetAccountId: existing?.budget_save_target_account_id ?? null,
        budgetSaveSourceAccountId: existing?.budget_save_source_account_id ?? null,
        sortOrder: existing?.sort_order ?? 0,
      })
      continue
    }

    await dependencies.upsertBudgetItem(ledgerId, {
      budgetId,
      scopeType: 'category',
      categoryId,
      categoryGroupId: null,
      budgetContainerId: containerId,
      amountMinor: 0,
      amountMode: 'fixed',
      dayRuleUnit: 'none',
      dayRuleValuesJson: '[]',
      budgetSaveEnabled: false,
      budgetSaveTargetAccountId: null,
      budgetSaveSourceAccountId: null,
      sortOrder: 0,
    })
  }

  for (const item of items) {
    if (String(item?.budget_container_id ?? '') !== String(containerId)) continue
    const categoryId = normalizeText(item?.category_id)
    if (!categoryId || selectedCategoryIdSet.has(categoryId)) continue

    const amountMinor = Math.max(0, Math.round(Number(item?.amount_minor ?? 0)))
    const hasBudgetSave = normalizeBudgetSaveEnabled(item?.budget_save_enabled)
    if (amountMinor <= 0 && !hasBudgetSave) {
      await dependencies.deleteBudgetItem(ledgerId, item.id)
      continue
    }

    await dependencies.upsertBudgetItem(ledgerId, {
      id: item.id,
      budgetId,
      scopeType: 'category',
      categoryId,
      categoryGroupId: null,
      budgetContainerId: null,
      amountMinor,
      amountMode: normalizeAmountMode(item?.amount_mode),
      dayRuleUnit: normalizeAmountMode(item?.amount_mode) === 'daily_average'
        ? normalizeDayRuleUnit(item?.day_rule_unit)
        : 'none',
      dayRuleValuesJson: JSON.stringify(
        normalizeAmountMode(item?.amount_mode) === 'daily_average'
          ? normalizeDayRuleValues(item?.day_rule_values ?? item?.day_rule_values_json, normalizeDayRuleUnit(item?.day_rule_unit))
          : [],
      ),
      budgetSaveEnabled: hasBudgetSave,
      budgetSaveTargetAccountId: item?.budget_save_target_account_id ?? null,
      budgetSaveSourceAccountId: item?.budget_save_source_account_id ?? null,
      sortOrder: item?.sort_order ?? 0,
    })
  }
}

export async function rollbackDailyPoolCategoryItems(ledgerId, state, containerId, categoryIds) {
  if (!state?.budget?.id) return
  const normalizedCategoryIds = normalizeCategoryIdList(categoryIds)
  if (!normalizedCategoryIds.length) return

  const previousByCategoryId = new Map()
  for (const item of state.items ?? []) {
    const categoryId = normalizeText(item?.category_id)
    if (!categoryId || !normalizedCategoryIds.includes(categoryId)) continue
    if (!previousByCategoryId.has(categoryId)) previousByCategoryId.set(categoryId, item)
  }

  const currentItems = await dependencies.listBudgetItems(ledgerId, state.budget.id)
  for (const categoryId of normalizedCategoryIds) {
    const previous = previousByCategoryId.get(categoryId)
    const current = currentItems.find((item) => (
      normalizeText(item?.category_id) === categoryId
      && String(item?.budget_container_id ?? '') === String(containerId)
    ))
    if (!previous && current?.id) {
      await dependencies.deleteBudgetItem(ledgerId, current.id)
      continue
    }
    if (previous?.id) {
      await dependencies.upsertBudgetItem(ledgerId, buildBudgetItemWritePayloadFromRow(previous))
    }
  }
}
export async function assertValidBudgetSaveConfig(ledgerId, config) {
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

export async function ensureBudgetForPeriod(ledgerId, period) {
  const normalizedPeriod = period?.key ? period : resolveCalendarBudgetPeriod(period?.monthKey ?? monthKeyFromDate())
  let budget = await dependencies.getBudgetByPeriod(ledgerId, normalizedPeriod.key)
  if (!budget) {
    try {
      budget = await dependencies.createBudget(ledgerId, {
        monthKey: normalizedPeriod.monthKey,
        periodKey: normalizedPeriod.key,
        periodStartDate: normalizedPeriod.startDate,
        periodEndDate: normalizedPeriod.endDate,
        periodMode: normalizedPeriod.mode,
        name: normalizedPeriod.mode === 'pay_cycle'
          ? `${normalizedPeriod.startDate}～${normalizedPeriod.endDate} 預算`
          : `${normalizedPeriod.monthKey} 月預算`,
        includeTransfers: false,
        includeLoanRepayments: false,
        includeReimbursedExpenses: false,
        budgetSaveTotalEnabled: false,
        budgetSaveTotalTargetAccountId: null,
        budgetSaveTotalSourceAccountId: null,
      })
    } catch (error) {
      if (!isBudgetPeriodConflict(error)) throw error
      budget = await dependencies.getBudgetByPeriod(ledgerId, normalizedPeriod.key)
      if (!budget) throw error
    }
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
  return loadBudgetSnapshotForPeriod(ledgerId, resolveCalendarBudgetPeriod(monthKey))
}

export async function loadBudgetSnapshotForPeriod(ledgerId, period) {
  const budget = await ensureBudgetForPeriod(ledgerId, period)
  const ledger = await dependencies.getLedger(ledgerId)
  const ledgerTimeZone = normalizeLedgerTimeZone(ledger?.timezone)
  const { startUtc, endUtc } = dateRangeUtc(period.startDate, period.endDate, ledgerTimeZone)
  const { startUtc: todayStartUtc, endUtc: todayEndUtc } = todayRangeUtc(ledgerTimeZone)
  const spentByCategoryDayTask = typeof dependencies.listBudgetSpentByCategoryAndDay === 'function'
    ? Promise.resolve()
      .then(() => dependencies.listBudgetSpentByCategoryAndDay(ledgerId, startUtc, endUtc))
      .catch((error) => {
        console.warn('[budget] listBudgetSpentByCategoryAndDay failed', error)
        return []
      })
    : Promise.resolve([])
  const [rawItems, spentRows, todaySpentRows, usedOccurrenceRows, budgetSavePreferences, rawContainers, spentByCategoryDayRows] = await Promise.all([
    dependencies.listBudgetItems(ledgerId, budget.id),
    dependencies.computeBudgetSpentByCategory(ledgerId, startUtc, endUtc),
    dependencies.computeBudgetSpentByCategory(ledgerId, todayStartUtc, todayEndUtc),
    dependencies.listBudgetUsageDaysByCategory(ledgerId, startUtc, endUtc),
    getBudgetSavePreferences(ledgerId),
    dependencies.listBudgetContainers(ledgerId, budget.id),
    spentByCategoryDayTask,
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
  const items = rawItems.map((item) => resolveBudgetItemForPeriod(item, period, usedDaysMap.get(String(item?.category_id ?? '').trim()) ?? []))

  return {
    budget,
    period,
    items,
    containers: rawContainers,
    spentRows,
    todaySpentRows,
    spentByCategoryDayRows,
    budgetSavePreferences,
  }
}
export async function normalizeBudgetItemPayload(ledgerId, payload = {}) {
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
  return {
    id: normalizeText(payload.id) || undefined,
    categoryId: payload.categoryId,
    amountMinor,
    amountMode,
    dayRuleUnit,
    dayRuleValues,
    budgetSave,
    budgetContainerId,
    sortOrder: payload.sortOrder ?? 0,
  }
}

export function buildBudgetItemWritePayload(budget, normalizedPayload, budgetContainerId = normalizedPayload.budgetContainerId, id = normalizedPayload.id) {
  return {
    id,
    budgetId: budget.id,
    scopeType: 'category',
    categoryId: normalizedPayload.categoryId,
    categoryGroupId: null,
    budgetContainerId,
    amountMinor: normalizedPayload.amountMinor,
    amountMode: normalizedPayload.amountMode,
    dayRuleUnit: normalizedPayload.dayRuleUnit,
    dayRuleValuesJson: JSON.stringify(normalizedPayload.dayRuleValues),
    budgetSaveEnabled: normalizedPayload.budgetSave.enabled,
    budgetSaveTargetAccountId: normalizedPayload.budgetSave.targetAccountId,
    budgetSaveSourceAccountId: normalizedPayload.budgetSave.sourceAccountId,
    sortOrder: normalizedPayload.sortOrder,
  }
}

export function hasDuplicateBudgetItemCategory(items = [], normalizedPayload) {
  return (items ?? []).some((item) => (
    String(item?.id ?? '') !== String(normalizedPayload.id ?? '')
    && String(item?.category_id ?? '') === String(normalizedPayload.categoryId ?? '')
  ))
}

export function assertBudgetItemCanSaveInMonth(items, containers, normalizedPayload, budgetContainerId = normalizedPayload.budgetContainerId) {
  if (normalizedPayload.budgetSave.enabled) {
    if (budgetContainerId) {
      const parentContainer = containers.find((c) => String(c?.id ?? '') === String(budgetContainerId))
      if (parentContainer && normalizeBudgetSaveEnabled(parentContainer?.budget_save_enabled)) {
        throw createBudgetError('budgeting.budget_save.error.parent_conflict')
      }
    }
    if (hasDuplicateBudgetItemCategory(items, normalizedPayload)) {
      throw createBudgetError('budgeting.budget_save.error.conflict')
    }
  }

  if (budgetContainerId) {
    const container = containers.find((c) => String(c?.id ?? '') === String(budgetContainerId))
    if (!container) {
      throw createBudgetError('budgeting.container.error.not_found')
    }
  }
}

export async function saveBudgetItem(ledgerId, monthKey, payload) {
  const budget = typeof monthKey === 'object'
    ? await ensureBudgetForPeriod(ledgerId, monthKey)
    : await ensureBudgetForMonth(ledgerId, monthKey)
  const normalizedPayload = await normalizeBudgetItemPayload(ledgerId, payload)
  const [items, containers] = await Promise.all([
    dependencies.listBudgetItems(ledgerId, budget.id),
    dependencies.listBudgetContainers(ledgerId, budget.id),
  ])
  assertBudgetItemCanSaveInMonth(items, containers, normalizedPayload)

  const id = await dependencies.upsertBudgetItem(ledgerId, {
    ...buildBudgetItemWritePayload(budget, normalizedPayload),
    id: normalizedPayload.id,
  })

  return id
}

export function findEquivalentContainerForMonth(state, selectedContainer) {
  if (!selectedContainer) return null
  const selectedName = normalizeText(selectedContainer?.name)
  if (!selectedName) return null
  return (state.containers ?? []).find((container) => normalizeText(container?.name) === selectedName) ?? null
}

export async function saveBudgetItemRange(ledgerId, startMonthKey, endMonthKey, payload = {}) {
  const monthKeys = listInclusiveMonthKeys(startMonthKey, endMonthKey || startMonthKey)
  const normalizedPayload = await normalizeBudgetItemPayload(ledgerId, payload)
  if (normalizedPayload.id) {
    return {
      monthKeys: [startMonthKey],
      itemIds: [await saveBudgetItem(ledgerId, startMonthKey, payload)],
    }
  }

  const monthStates = []
  let selectedContainer = null
  for (const monthKey of monthKeys) {
    const budget = await dependencies.getBudgetByMonth(ledgerId, monthKey)
    const [items, containers] = budget
      ? await Promise.all([
        dependencies.listBudgetItems(ledgerId, budget.id),
        dependencies.listBudgetContainers(ledgerId, budget.id),
      ])
      : [[], []]
    const state = { monthKey, budget, items, containers, budgetContainerId: null }
    if (monthKey === startMonthKey && normalizedPayload.budgetContainerId) {
      selectedContainer = containers.find((container) => String(container?.id ?? '') === String(normalizedPayload.budgetContainerId))
      if (!selectedContainer) {
        throw createBudgetError('budgeting.container.error.not_found')
      }
      state.budgetContainerId = normalizedPayload.budgetContainerId
    }
    monthStates.push(state)
  }

  const conflictMonthKeys = []
  for (const state of monthStates) {
    if (hasDuplicateBudgetItemCategory(state.items, normalizedPayload)) {
      conflictMonthKeys.push(state.monthKey)
    }
  }
  if (conflictMonthKeys.length > 0) {
    const error = createBudgetError('budgeting.budget_item.error.conflict_range')
    error.monthKeys = conflictMonthKeys
    error.message = `${error.code}:${conflictMonthKeys.join(',')}`
    throw error
  }

  if (normalizedPayload.budgetContainerId) {
    const missingContainerMonthKeys = []
    for (const state of monthStates) {
      if (state.monthKey === startMonthKey) continue
      const equivalentContainer = findEquivalentContainerForMonth(state, selectedContainer)
      if (!equivalentContainer) {
        missingContainerMonthKeys.push(state.monthKey)
        continue
      }
      state.budgetContainerId = equivalentContainer.id
    }
    if (missingContainerMonthKeys.length > 0) {
      const error = createBudgetError('budgeting.container.error.not_found_range')
      error.monthKeys = missingContainerMonthKeys
      error.message = `${error.code}:${missingContainerMonthKeys.join(',')}`
      throw error
    }
  }

  for (const state of monthStates) {
    assertBudgetItemCanSaveInMonth(state.items, state.containers, normalizedPayload, state.budgetContainerId)
  }

  const itemIds = []
  try {
    for (const state of monthStates) {
      const budget = state.budget ?? await ensureBudgetForMonth(ledgerId, state.monthKey)
      state.budget = budget
      const itemId = createId('bi')
      const savedItemId = await dependencies.upsertBudgetItem(
        ledgerId,
        buildBudgetItemWritePayload(budget, normalizedPayload, state.budgetContainerId, itemId),
      )
      itemIds.push(savedItemId)
    }
  } catch (error) {
    await Promise.allSettled(
      itemIds.map((itemId) => dependencies.deleteBudgetItem(ledgerId, itemId)),
    )
    throw error
  }

  return { monthKeys, itemIds }
}

export async function saveBudgetTotalConfig(ledgerId, monthKey, payload = {}) {
  const budget = typeof monthKey === 'object'
    ? await ensureBudgetForPeriod(ledgerId, monthKey)
    : await ensureBudgetForMonth(ledgerId, monthKey)
  const budgetSave = await assertValidBudgetSaveConfig(ledgerId, normalizeBudgetSaveConfig(payload))
  await dependencies.updateBudgetSaveTotalConfig(ledgerId, budget.id, {
    enabled: budgetSave.enabled,
    targetAccountId: budgetSave.targetAccountId,
    sourceAccountId: budgetSave.sourceAccountId,
  })
  return typeof monthKey === 'object'
    ? dependencies.getBudgetByPeriod(ledgerId, monthKey.key)
    : dependencies.getBudgetByMonth(ledgerId, monthKey)
}

export async function normalizeBudgetContainerPayload(ledgerId, payload = {}) {
  const name = normalizeText(payload.name)
  if (!name) {
    throw createBudgetError('budgeting.container.error.name_required')
  }

  const surplusMode = normalizeContainerSurplusMode(
    payload.surplusMode ?? payload.surplus_mode,
    { budgetSaveEnabled: payload.budgetSaveEnabled ?? payload.budget_save_enabled },
  )
  const savePayload = surplusMode === 'save'
    ? payload
    : {
      ...payload,
      budgetSaveEnabled: false,
      budget_save_enabled: false,
      budgetSaveTargetAccountId: null,
      budget_save_target_account_id: null,
      budgetSaveSourceAccountId: null,
      budget_save_source_account_id: null,
    }
  const budgetSave = await assertValidBudgetSaveConfig(ledgerId, normalizeBudgetSaveConfig(savePayload))
  if (surplusMode === 'save' && !budgetSave.enabled) {
    throw createBudgetError('budgeting.container.error.surplus_save_required')
  }
  return {
    id: normalizeText(payload.id) || undefined,
    name,
    amountMinor: Math.max(0, Math.round(Number(payload.amountMinor))),
    budgetSave: surplusMode === 'save' ? budgetSave : {
      enabled: false,
      targetAccountId: null,
      sourceAccountId: null,
    },
    surplusMode,
    periodMode: normalizeContainerPeriodMode(payload.periodMode),
    sortOrder: payload.sortOrder ?? 0,
    categoryIds: normalizeCategoryIdList(payload.categoryIds),
  }
}

export function buildBudgetContainerWritePayload(budget, normalizedPayload, id = normalizedPayload.id) {
  return {
    id,
    budgetId: budget.id,
    name: normalizedPayload.name,
    amountMinor: normalizedPayload.amountMinor,
    budgetSaveEnabled: normalizedPayload.budgetSave.enabled,
    budgetSaveTargetAccountId: normalizedPayload.budgetSave.targetAccountId,
    budgetSaveSourceAccountId: normalizedPayload.budgetSave.sourceAccountId,
    periodMode: normalizedPayload.periodMode,
    surplusMode: normalizeContainerSurplusMode(normalizedPayload.surplusMode, {
      budgetSaveEnabled: normalizedPayload.budgetSave.enabled,
    }),
    sortOrder: normalizedPayload.sortOrder,
  }
}

export function hasBudgetSaveChildConflict(items = [], normalizedPayload, containerId = normalizedPayload.id) {
  if (!normalizedPayload.budgetSave.enabled) return false
  const normalizedContainerId = normalizeText(containerId)
  const selectedCategoryIds = new Set(normalizedPayload.categoryIds)

  return (items ?? []).some((item) => {
    if (!normalizeBudgetSaveEnabled(item?.budget_save_enabled)) return false
    if (normalizedContainerId && String(item?.budget_container_id ?? '') === normalizedContainerId) return true
    return normalizedPayload.periodMode === 'daily' && selectedCategoryIds.has(normalizeText(item?.category_id))
  })
}

export function assertNoBudgetSaveChildConflict(items, normalizedPayload, containerId = normalizedPayload.id) {
  if (hasBudgetSaveChildConflict(items, normalizedPayload, containerId)) {
    throw createBudgetError('budgeting.budget_save.error.group_conflict')
  }
}

export async function saveBudgetContainer(ledgerId, monthKey, payload) {
  const budget = typeof monthKey === 'object'
    ? await ensureBudgetForPeriod(ledgerId, monthKey)
    : await ensureBudgetForMonth(ledgerId, monthKey)
  const normalizedPayload = await normalizeBudgetContainerPayload(ledgerId, payload)

  const existingContainers = await dependencies.listBudgetContainers(ledgerId, budget.id)
  const duplicateNameExists = existingContainers.some((container) => (
    String(container?.id ?? '') !== String(normalizedPayload.id ?? '')
    && normalizeText(container?.name) === normalizedPayload.name
  ))
  if (duplicateNameExists) {
    throw createBudgetError('budgeting.container.error.name_conflict')
  }

  const items = await dependencies.listBudgetItems(ledgerId, budget.id)
  assertNoBudgetSaveChildConflict(items, normalizedPayload)

  const containerId = await dependencies.upsertBudgetContainer(
    ledgerId,
    buildBudgetContainerWritePayload(budget, normalizedPayload),
  )

  if (normalizedPayload.periodMode === 'daily' && Array.isArray(payload.categoryIds)) {
    await syncDailyPoolCategoryItems(ledgerId, budget.id, containerId, normalizedPayload.categoryIds)
  }

  return containerId
}

export async function saveBudgetContainerRange(ledgerId, startMonthKey, endMonthKey, payload = {}) {
  const monthKeys = listInclusiveMonthKeys(startMonthKey, endMonthKey || startMonthKey)
  const normalizedPayload = await normalizeBudgetContainerPayload(ledgerId, payload)
  if (normalizedPayload.id) {
    return {
      monthKeys: [startMonthKey],
      containerIds: [await saveBudgetContainer(ledgerId, startMonthKey, payload)],
    }
  }

  const monthStates = []
  const conflictMonthKeys = []
  for (const monthKey of monthKeys) {
    const budget = await dependencies.getBudgetByMonth(ledgerId, monthKey)
    const containers = budget ? await dependencies.listBudgetContainers(ledgerId, budget.id) : []
    const items = budget ? await dependencies.listBudgetItems(ledgerId, budget.id) : []
    monthStates.push({ monthKey, budget, containers, items })
    if (containers.some((container) => normalizeText(container?.name) === normalizedPayload.name)) {
      conflictMonthKeys.push(monthKey)
    }
  }

  if (conflictMonthKeys.length > 0) {
    const error = createBudgetError('budgeting.container.error.name_conflict_range')
    error.monthKeys = conflictMonthKeys
    error.message = `${error.code}:${conflictMonthKeys.join(',')}`
    throw error
  }

  for (const state of monthStates) {
    assertNoBudgetSaveChildConflict(state.items, normalizedPayload)
  }

  const containerIds = []
  const touchedStates = []
  try {
    for (const state of monthStates) {
      const budget = state.budget ?? await ensureBudgetForMonth(ledgerId, state.monthKey)
      state.budget = budget
      const containerId = createId('bc')
      const savedContainerId = await dependencies.upsertBudgetContainer(
        ledgerId,
        buildBudgetContainerWritePayload(budget, normalizedPayload, containerId),
      )
      containerIds.push(savedContainerId)
      touchedStates.push({ state, containerId: savedContainerId })
      if (normalizedPayload.periodMode === 'daily' && Array.isArray(payload.categoryIds)) {
        await syncDailyPoolCategoryItems(ledgerId, budget.id, savedContainerId, normalizedPayload.categoryIds)
      }
    }
  } catch (error) {
    if (normalizedPayload.periodMode === 'daily' && Array.isArray(payload.categoryIds)) {
      await Promise.allSettled(
        touchedStates.map(({ state, containerId }) => (
          rollbackDailyPoolCategoryItems(ledgerId, state, containerId, normalizedPayload.categoryIds)
        )),
      )
    }
    await Promise.allSettled(
      containerIds.map((containerId) => dependencies.deleteBudgetContainer(ledgerId, containerId)),
    )
    throw error
  }

  return { monthKeys, containerIds }
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
      periodMode: normalizeContainerPeriodMode(container.period_mode),
      surplusMode: normalizeContainerSurplusMode(container.surplus_mode, {
        budgetSaveEnabled: Number(container.budget_save_enabled ?? 0) === 1,
      }),
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

export function normalizeBudgetPeriodSettingsPayload(payload = {}) {
  return {
    budgetPeriodMode: normalizeBudgetPeriodMode(payload.budgetPeriodMode ?? payload.budget_period_mode),
    budgetPayDay: normalizePayDay(payload.budgetPayDay ?? payload.budget_pay_day),
  }
}

export function isBudgetPeriodStructureEmpty(items = [], containers = [], budget = null) {
  const hasItems = Array.isArray(items) && items.length > 0
  const hasContainers = Array.isArray(containers) && containers.length > 0
  const hasTotalSaveConfig = Number(budget?.budget_save_total_enabled ?? 0) === 1
    && Boolean(
      String(budget?.budget_save_total_target_account_id ?? '').trim()
      || String(budget?.budget_save_total_source_account_id ?? '').trim(),
    )
  return !hasItems && !hasContainers && !hasTotalSaveConfig
}

export async function loadBudgetStructureForPeriod(ledgerId, period) {
  const normalizedPeriod = period?.key ? period : resolveCalendarBudgetPeriod(period?.monthKey ?? monthKeyFromDate())
  let budget = await dependencies.getBudgetByPeriod(ledgerId, normalizedPeriod.key)
  if (!budget && normalizedPeriod.mode !== 'pay_cycle') {
    budget = await dependencies.getBudgetByMonth(ledgerId, normalizedPeriod.monthKey)
  }
  if (!budget) return null

  const [items, containers] = await Promise.all([
    dependencies.listBudgetItems(ledgerId, budget.id),
    dependencies.listBudgetContainers(ledgerId, budget.id),
  ])

  return {
    budget,
    period: normalizedPeriod,
    items,
    containers,
  }
}

export async function carryForwardBudgetPeriodStructure(ledgerId, sourceSnapshot, targetPeriod) {
  const targetBudget = await ensureBudgetForPeriod(ledgerId, targetPeriod)
  const { budget: sourceBudget, items: sourceItems, containers: sourceContainers } = sourceSnapshot

  const containerIdMap = new Map()
  for (const [index, container] of sourceContainers.entries()) {
    const newId = createId('bc')
    containerIdMap.set(container.id, newId)
    await dependencies.upsertBudgetContainer(ledgerId, {
      id: newId,
      budgetId: targetBudget.id,
      name: container.name,
      amountMinor: Number(container.amount_minor),
      budgetSaveEnabled: Number(container.budget_save_enabled ?? 0) === 1,
      budgetSaveTargetAccountId: container.budget_save_target_account_id,
      budgetSaveSourceAccountId: container.budget_save_source_account_id,
      periodMode: normalizeContainerPeriodMode(container.period_mode),
      surplusMode: normalizeContainerSurplusMode(container.surplus_mode, {
        budgetSaveEnabled: Number(container.budget_save_enabled ?? 0) === 1,
      }),
      sortOrder: index,
    })
  }

  for (const [index, item] of sourceItems.entries()) {
    const newContainerId = item.budget_container_id
      ? (containerIdMap.get(item.budget_container_id) ?? null)
      : null
    await dependencies.upsertBudgetItem(ledgerId, {
      id: createId('bi'),
      budgetId: targetBudget.id,
      scopeType: item.scope_type,
      categoryId: item.category_id,
      categoryGroupId: item.category_group_id,
      budgetContainerId: newContainerId,
      amountMinor: Number(item.amount_minor),
      amountMode: normalizeAmountMode(item.amount_mode),
      dayRuleUnit: normalizeDayRuleUnit(item.day_rule_unit),
      dayRuleValuesJson: JSON.stringify(
        normalizeDayRuleValues(item.day_rule_values_json, normalizeDayRuleUnit(item.day_rule_unit)),
      ),
      budgetSaveEnabled: Number(item.budget_save_enabled ?? 0) === 1,
      budgetSaveTargetAccountId: item.budget_save_target_account_id,
      budgetSaveSourceAccountId: item.budget_save_source_account_id,
      sortOrder: index,
    })
  }

  await dependencies.updateBudgetSaveTotalConfig(ledgerId, targetBudget.id, {
    enabled: Number(sourceBudget.budget_save_total_enabled ?? 0) === 1,
    targetAccountId: sourceBudget.budget_save_total_target_account_id,
    sourceAccountId: sourceBudget.budget_save_total_source_account_id,
  })

  return {
    carriedItems: sourceItems.length,
    carriedContainers: sourceContainers.length,
    sourcePeriodKey: sourceSnapshot.period?.key,
    targetPeriodKey: targetPeriod.key,
  }
}

export async function applyLedgerBudgetPeriodSettings(ledgerId, payload = {}, options = {}) {
  if (!ledgerId) throw new Error('缺少帳本 ID')

  const nextSettings = normalizeBudgetPeriodSettingsPayload(payload)
  const referenceDate = options.referenceDate ?? new Date()
  const ledger = await dependencies.getLedger(ledgerId)
  if (!ledger) throw new Error('找不到帳本')

  const currentSettings = normalizeBudgetPeriodSettingsPayload({
    budgetPeriodMode: ledger.budget_period_mode,
    budgetPayDay: ledger.budget_pay_day,
  })
  const settingsChanged = currentSettings.budgetPeriodMode !== nextSettings.budgetPeriodMode
    || currentSettings.budgetPayDay !== nextSettings.budgetPayDay

  const oldPeriod = resolveCurrentBudgetPeriodForLedger(ledger, referenceDate)
  const oldSnapshot = settingsChanged
    ? await loadBudgetStructureForPeriod(ledgerId, oldPeriod)
    : null

  const updatedLedger = await dependencies.updateLedgerBudgetPeriodSettings(ledgerId, {
    budgetPeriodMode: nextSettings.budgetPeriodMode,
    budgetPayDay: nextSettings.budgetPayDay,
  })

  const newPeriod = resolveCurrentBudgetPeriodForLedger(updatedLedger, referenceDate)
  if (!settingsChanged || oldPeriod.key === newPeriod.key) {
    return {
      updatedLedger,
      carriedForward: false,
      oldPeriod,
      newPeriod,
    }
  }

  if (!oldSnapshot || isBudgetPeriodStructureEmpty(oldSnapshot.items, oldSnapshot.containers, oldSnapshot.budget)) {
    return {
      updatedLedger,
      carriedForward: false,
      oldPeriod,
      newPeriod,
    }
  }

  const targetBudget = await ensureBudgetForPeriod(ledgerId, newPeriod)
  const [targetItems, targetContainers] = await Promise.all([
    dependencies.listBudgetItems(ledgerId, targetBudget.id),
    dependencies.listBudgetContainers(ledgerId, targetBudget.id),
  ])

  if (!isBudgetPeriodStructureEmpty(targetItems, targetContainers, targetBudget)) {
    return {
      updatedLedger,
      carriedForward: false,
      oldPeriod,
      newPeriod,
    }
  }

  const carryResult = await carryForwardBudgetPeriodStructure(ledgerId, oldSnapshot, newPeriod)

  return {
    updatedLedger,
    carriedForward: true,
    oldPeriod,
    newPeriod,
    ...carryResult,
  }
}
