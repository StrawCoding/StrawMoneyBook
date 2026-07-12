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
  async getBudgetByPeriod(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.getBudgetByPeriod(...args)
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
  async getLedger(...args) {
    const mod = await import('../repositories/ledger.repo.js')
    return mod.getLedger(...args)
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

function normalizeContainerPeriodMode(value) {
  return String(value ?? '').trim() === 'daily' ? 'daily' : 'monthly'
}

function parseMonthKey(monthKey) {
  const matched = /^(\d{4})-(\d{2})$/.exec(String(monthKey ?? '').trim())
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
  return { year, month }
}

function monthKeyIndex(monthKey) {
  const parsed = parseMonthKey(monthKey)
  if (!parsed) return null
  return parsed.year * 12 + (parsed.month - 1)
}

function monthKeyFromIndex(index) {
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

function normalizeBudgetPeriodMode(value) {
  return String(value ?? '').trim() === 'pay_cycle' ? 'pay_cycle' : 'calendar_month'
}

function normalizeLedgerTimeZone(value) {
  const timeZone = normalizeText(value)
  if (!timeZone) return 'Asia/Taipei'
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date('2026-01-01T00:00:00.000Z'))
    return timeZone
  } catch {
    return 'Asia/Taipei'
  }
}

function normalizePayDay(value) {
  return Math.min(31, Math.max(1, Math.trunc(Number(value ?? 1)) || 1))
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

function dayKeyFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function shiftMonth(year, month, offset) {
  const index = year * 12 + (month - 1) + offset
  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  }
}

function startDayForMonth(year, month, payDay) {
  return Math.min(normalizePayDay(payDay), new Date(year, month, 0).getDate())
}

function shiftDayKey(dayKey, offsetDays) {
  const parts = parseDayKey(dayKey)
  if (!parts) return ''
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays)).toISOString().slice(0, 10)
}

function getZonedDateParts(dateLike, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeLedgerTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = formatter.formatToParts(dateLike instanceof Date ? dateLike : new Date(dateLike))
  const read = (type) => Number(parts.find((item) => item.type === type)?.value ?? 0)
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  }
}

function resolveZonedDateTimeUtcIso(parts, timeZone = 'Asia/Taipei') {
  const desiredEpochMs = Date.UTC(
    Number(parts?.year ?? 0),
    Number(parts?.month ?? 1) - 1,
    Number(parts?.day ?? 1),
    Number(parts?.hour ?? 0),
    Number(parts?.minute ?? 0),
    Number(parts?.second ?? 0),
  )
  let resolvedEpochMs = desiredEpochMs

  for (let index = 0; index < 3; index += 1) {
    const actual = getZonedDateParts(resolvedEpochMs, timeZone)
    const actualEpochMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
    const diffMs = desiredEpochMs - actualEpochMs
    if (diffMs === 0) break
    resolvedEpochMs += diffMs
  }

  return new Date(resolvedEpochMs).toISOString()
}

export function resolveCalendarBudgetPeriod(monthKey) {
  const parsed = parseMonthKey(monthKey)
  const fallback = monthKeyFromDate()
  const { year, month } = parsed ?? parseMonthKey(fallback)
  const key = dayKeyFromParts(year, month, 1).slice(0, 7)
  return {
    mode: 'calendar_month',
    key,
    monthKey: key,
    startDate: `${key}-01`,
    endDate: dayKeyFromParts(year, month, new Date(year, month, 0).getDate()),
    label: key,
  }
}

export function resolvePayCycleBudgetPeriod(dateKeyOrDate = new Date(), payDay = 1) {
  const dateKey = dateKeyOrDate instanceof Date
    ? monthKeyFromDate(dateKeyOrDate) + `-${String(dateKeyOrDate.getDate()).padStart(2, '0')}`
    : String(dateKeyOrDate ?? '').trim()
  const parts = parseDayKey(dateKey) ?? parseDayKey(`${String(dateKey).slice(0, 7)}-01`) ?? parseDayKey(monthKeyFromDate() + '-01')
  const currentStartDay = startDayForMonth(parts.year, parts.month, payDay)
  const startMonth = parts.day >= currentStartDay
    ? { year: parts.year, month: parts.month }
    : shiftMonth(parts.year, parts.month, -1)
  const nextMonth = shiftMonth(startMonth.year, startMonth.month, 1)
  const startDate = dayKeyFromParts(
    startMonth.year,
    startMonth.month,
    startDayForMonth(startMonth.year, startMonth.month, payDay),
  )
  const nextStartDate = dayKeyFromParts(
    nextMonth.year,
    nextMonth.month,
    startDayForMonth(nextMonth.year, nextMonth.month, payDay),
  )
  const endDate = shiftDayKey(nextStartDate, -1)
  return {
    mode: 'pay_cycle',
    key: `pay:${startDate}:${endDate}`,
    monthKey: `pay:${startDate}`,
    startDate,
    endDate,
    label: `${startDate}~${endDate}`,
    nextPayDate: nextStartDate,
  }
}

export function resolveBudgetPeriodForLedger(ledger, dateKeyOrMonth = monthKeyFromDate()) {
  if (normalizeBudgetPeriodMode(ledger?.budget_period_mode) === 'pay_cycle') {
    const dateKey = /^\d{4}-\d{2}$/.test(String(dateKeyOrMonth ?? '').trim())
      ? `${dateKeyOrMonth}-01`
      : dateKeyOrMonth
    return resolvePayCycleBudgetPeriod(dateKey, ledger?.budget_pay_day)
  }
  return resolveCalendarBudgetPeriod(String(dateKeyOrMonth ?? '').slice(0, 7))
}

export function previousBudgetPeriod(period, ledger = {}) {
  if (period?.mode === 'pay_cycle') {
    return resolvePayCycleBudgetPeriod(shiftDayKey(period.startDate, -1), ledger?.budget_pay_day)
  }
  return resolveCalendarBudgetPeriod(previousMonthKey(period?.monthKey ?? period?.key))
}

export function nextBudgetPeriod(period, ledger = {}) {
  if (period?.mode === 'pay_cycle') {
    return resolvePayCycleBudgetPeriod(shiftDayKey(period.endDate, 1), ledger?.budget_pay_day)
  }
  const index = monthKeyIndex(period?.monthKey ?? period?.key)
  return resolveCalendarBudgetPeriod(monthKeyFromIndex((index ?? monthKeyIndex(monthKeyFromDate())) + 1))
}

export function listInclusiveMonthKeys(startMonthKey, endMonthKey = startMonthKey) {
  const startIndex = monthKeyIndex(startMonthKey)
  const endIndex = monthKeyIndex(endMonthKey)
  if (startIndex === null || endIndex === null || endIndex < startIndex) {
    throw createBudgetError('budgeting.container.error.invalid_month_range')
  }

  const months = []
  for (let index = startIndex; index <= endIndex; index += 1) {
    months.push(monthKeyFromIndex(index))
  }
  return months
}

export function daysInPeriod(period) {
  const start = parseDayKey(period?.startDate)
  const end = parseDayKey(period?.endDate)
  if (!start || !end) return 30
  const startMs = Date.UTC(start.year, start.month - 1, start.day)
  const endMs = Date.UTC(end.year, end.month - 1, end.day)
  return Math.max(1, Math.round((endMs - startMs) / 86400000) + 1)
}

export function daysInMonthForKey(monthKey) {
  const parsed = parseMonthKey(monthKey)
  if (!parsed) return 30
  const monthIndex = parsed.month - 1
  return new Date(parsed.year, monthIndex + 1, 0).getDate()
}

export function resolveContainerMonthlyAmountMinor(container, monthKey) {
  const amountMinor = Math.max(0, Math.round(Number(container?.amount_minor ?? 0)))
  if (normalizeContainerPeriodMode(container?.period_mode) !== 'daily') return amountMinor
  return amountMinor * daysInMonthForKey(monthKey)
}

export function resolveContainerPeriodAmountMinor(container, period) {
  const amountMinor = Math.max(0, Math.round(Number(container?.amount_minor ?? 0)))
  if (normalizeContainerPeriodMode(container?.period_mode) !== 'daily') return amountMinor
  return amountMinor * daysInPeriod(period)
}

export function isDailyPoolContainer(container) {
  return normalizeContainerPeriodMode(container?.period_mode ?? container?.periodMode) === 'daily'
}

export function isDailyPoolChildItem(item, containers = []) {
  const containerId = normalizeText(item?.budget_container_id)
  if (!containerId) return false
  const container = (containers ?? []).find((entry) => String(entry?.id ?? '') === containerId)
  return Boolean(container) && isDailyPoolContainer(container)
}

function normalizeCategoryIdList(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeText(value))
        .filter(Boolean),
    ),
  )
}

function buildBudgetItemWritePayloadFromRow(item) {
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

async function syncDailyPoolCategoryItems(ledgerId, budgetId, containerId, categoryIds) {
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

async function rollbackDailyPoolCategoryItems(ledgerId, state, containerId, categoryIds) {
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

function todayRangeUtc(timeZone = 'Asia/Taipei') {
  const nowParts = getZonedDateParts(new Date(), timeZone)
  const todayKey = dayKeyFromParts(nowParts.year, nowParts.month, nowParts.day)
  const tomorrow = parseDayKey(shiftDayKey(todayKey, 1))
  return {
    startUtc: resolveZonedDateTimeUtcIso({ ...nowParts, hour: 0, minute: 0, second: 0 }, timeZone),
    endUtc: resolveZonedDateTimeUtcIso({ ...tomorrow, hour: 0, minute: 0, second: 0 }, timeZone),
  }
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

function countDailyRuleOccurrencesInRange(startDate, endDate, unit, values) {
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

function resolveBudgetItemForPeriod(item, period, usedDays = []) {
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

function resolveBudgetItemForMonth(item, monthKey, usedDays = []) {
  const period = resolveCalendarBudgetPeriod(monthKey)
  return resolveBudgetItemForPeriod(item, period, usedDays)
}

export function monthRangeUtc(monthKey, timeZone = 'Asia/Taipei') {
  const [year, month] = monthKey.split('-').map((part) => Number(part))
  const next = shiftMonth(year, month, 1)

  return {
    startUtc: resolveZonedDateTimeUtcIso({ year, month, day: 1, hour: 0, minute: 0, second: 0 }, timeZone),
    endUtc: resolveZonedDateTimeUtcIso({ year: next.year, month: next.month, day: 1, hour: 0, minute: 0, second: 0 }, timeZone),
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

export async function ensureBudgetForPeriod(ledgerId, period) {
  const normalizedPeriod = period?.key ? period : resolveCalendarBudgetPeriod(period?.monthKey ?? monthKeyFromDate())
  let budget = await dependencies.getBudgetByPeriod(ledgerId, normalizedPeriod.key)
  if (!budget) {
    budget = await dependencies.createBudget(ledgerId, {
      monthKey: normalizedPeriod.mode === 'calendar_month' ? normalizedPeriod.monthKey : normalizedPeriod.monthKey,
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
  const [rawItems, spentRows, todaySpentRows, usedOccurrenceRows, budgetSavePreferences, rawContainers] = await Promise.all([
    dependencies.listBudgetItems(ledgerId, budget.id),
    dependencies.computeBudgetSpentByCategory(ledgerId, startUtc, endUtc),
    dependencies.computeBudgetSpentByCategory(ledgerId, todayStartUtc, todayEndUtc),
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
  const items = rawItems.map((item) => resolveBudgetItemForPeriod(item, period, usedDaysMap.get(String(item?.category_id ?? '').trim()) ?? []))

  return {
    budget,
    period,
    items,
    containers: rawContainers,
    spentRows,
    todaySpentRows,
    budgetSavePreferences,
  }
}

export function dateRangeUtc(startDate, endDate, timeZone = 'Asia/Taipei') {
  const start = parseDayKey(startDate)
  const end = parseDayKey(endDate)
  if (!start || !end) return monthRangeUtc(monthKeyFromDate(), timeZone)
  const endNext = shiftDayKey(endDate, 1)
  const endParts = parseDayKey(endNext)
  return {
    startUtc: resolveZonedDateTimeUtcIso({ ...start, hour: 0, minute: 0, second: 0 }, timeZone),
    endUtc: resolveZonedDateTimeUtcIso({ ...endParts, hour: 0, minute: 0, second: 0 }, timeZone),
  }
}

async function normalizeBudgetItemPayload(ledgerId, payload = {}) {
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

function buildBudgetItemWritePayload(budget, normalizedPayload, budgetContainerId = normalizedPayload.budgetContainerId, id = normalizedPayload.id) {
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

function hasDuplicateBudgetItemCategory(items = [], normalizedPayload) {
  return (items ?? []).some((item) => (
    String(item?.id ?? '') !== String(normalizedPayload.id ?? '')
    && String(item?.category_id ?? '') === String(normalizedPayload.categoryId ?? '')
  ))
}

function assertBudgetItemCanSaveInMonth(items, containers, normalizedPayload, budgetContainerId = normalizedPayload.budgetContainerId) {
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

function findEquivalentContainerForMonth(state, selectedContainer) {
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

async function normalizeBudgetContainerPayload(ledgerId, payload = {}) {
  const name = normalizeText(payload.name)
  if (!name) {
    throw createBudgetError('budgeting.container.error.name_required')
  }

  const budgetSave = await assertValidBudgetSaveConfig(ledgerId, normalizeBudgetSaveConfig(payload))
  return {
    id: normalizeText(payload.id) || undefined,
    name,
    amountMinor: Math.max(0, Math.round(Number(payload.amountMinor))),
    budgetSave,
    periodMode: normalizeContainerPeriodMode(payload.periodMode),
    sortOrder: payload.sortOrder ?? 0,
    categoryIds: normalizeCategoryIdList(payload.categoryIds),
  }
}

function buildBudgetContainerWritePayload(budget, normalizedPayload, id = normalizedPayload.id) {
  return {
    id,
    budgetId: budget.id,
    name: normalizedPayload.name,
    amountMinor: normalizedPayload.amountMinor,
    budgetSaveEnabled: normalizedPayload.budgetSave.enabled,
    budgetSaveTargetAccountId: normalizedPayload.budgetSave.targetAccountId,
    budgetSaveSourceAccountId: normalizedPayload.budgetSave.sourceAccountId,
    periodMode: normalizedPayload.periodMode,
    sortOrder: normalizedPayload.sortOrder,
  }
}

function hasBudgetSaveChildConflict(items = [], normalizedPayload, containerId = normalizedPayload.id) {
  if (!normalizedPayload.budgetSave.enabled) return false
  const normalizedContainerId = normalizeText(containerId)
  const selectedCategoryIds = new Set(normalizedPayload.categoryIds)

  return (items ?? []).some((item) => {
    if (!normalizeBudgetSaveEnabled(item?.budget_save_enabled)) return false
    if (normalizedContainerId && String(item?.budget_container_id ?? '') === normalizedContainerId) return true
    return normalizedPayload.periodMode === 'daily' && selectedCategoryIds.has(normalizeText(item?.category_id))
  })
}

function assertNoBudgetSaveChildConflict(items, normalizedPayload, containerId = normalizedPayload.id) {
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
