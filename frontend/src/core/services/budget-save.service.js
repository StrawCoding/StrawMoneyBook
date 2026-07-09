import { getBudgetSavePreferences, resolveContainerMonthlyAmountMinor } from './budget.service.js'

const defaultDependencies = {
  async getLedger(...args) {
    const mod = await import('../repositories/ledger.repo.js')
    return mod.getLedger(...args)
  },
  async listBudgetsWithSaveRules(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.listBudgetsWithSaveRules(...args)
  },
  async listBudgetItems(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.listBudgetItems(...args)
  },
  async listBudgetContainers(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.listBudgetContainers(...args)
  },
  async computeBudgetSpentByCategory(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.computeBudgetSpentByCategory(...args)
  },
  async getBudgetSaveSettlement(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.getBudgetSaveSettlement(...args)
  },
  async upsertBudgetSaveSettlement(...args) {
    const mod = await import('../repositories/budget.repo.js')
    return mod.upsertBudgetSaveSettlement(...args)
  },
  async findTransactionByIdempotencyKey(...args) {
    const mod = await import('../repositories/transaction.repo.js')
    return mod.findTransactionByIdempotencyKey(...args)
  },
  async createTransfer(...args) {
    const mod = await import('./transaction.service.js')
    return mod.createTransfer(...args)
  },
  async listAccounts(...args) {
    const mod = await import('../repositories/account.repo.js')
    return mod.listAccounts(...args)
  },
  async getAccountBalances(...args) {
    const mod = await import('../repositories/account.repo.js')
    return mod.getAccountBalances(...args)
  },
  async getBudgetSavePreferences(...args) {
    return getBudgetSavePreferences(...args)
  },
}

const dependencies = { ...defaultDependencies }

export function setBudgetSaveDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

export function resetBudgetSaveDependenciesForTest() {
  Object.assign(dependencies, defaultDependencies)
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeCurrencyCode(value, fallback = 'TWD') {
  const text = normalizeText(value).toUpperCase()
  return /^[A-Z]{3}$/.test(text) ? text : fallback
}

function normalizeBudgetSaveEnabled(value) {
  return value === true || value === 1 || value === '1'
}

function normalizeAmountMode(value) {
  return normalizeText(value) === 'daily_average' ? 'daily_average' : 'fixed'
}

function normalizeDayRuleUnit(value) {
  const unit = normalizeText(value)
  if (unit === 'weekday' || unit === 'monthday') return unit
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
  return Array.from(
    new Set(
      parsed
        .map((value) => Math.trunc(Number(value)))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= max),
    ),
  ).sort((a, b) => a - b)
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

function getZonedDateParts(dateLike, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
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

function buildDayKeyFromParts(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function shiftDayKey(dayKey, offsetDays) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeText(dayKey))
  if (!matched) return ''
  const baseUtc = Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]))
  return new Date(baseUtc + (offsetDays * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10)
}

function compareMonthKey(left, right) {
  return normalizeText(left).localeCompare(normalizeText(right))
}

function getMonthLastDay(monthKey) {
  const [year, month] = normalizeText(monthKey).split('-').map((part) => Number(part))
  if (!year || !month) return 28
  return new Date(year, month, 0).getDate()
}

function buildMonthLastDayKey(monthKey) {
  const lastDay = getMonthLastDay(monthKey)
  return `${monthKey}-${String(lastDay).padStart(2, '0')}`
}

function listMatchingDayKeys(monthKey, item) {
  const amountMode = normalizeAmountMode(item?.amount_mode)
  if (amountMode !== 'daily_average') return []
  const unit = normalizeDayRuleUnit(item?.day_rule_unit)
  const values = normalizeDayRuleValues(item?.day_rule_values ?? item?.day_rule_values_json, unit)
  if (unit === 'none' || values.length === 0) return []
  const [year, month] = normalizeText(monthKey).split('-').map((part) => Number(part))
  if (!year || !month) return []
  const lastDay = getMonthLastDay(monthKey)
  const result = []
  if (unit === 'monthday') {
    for (const value of values) {
      if (value > lastDay) continue
      result.push(`${monthKey}-${String(value).padStart(2, '0')}`)
    }
    return result.sort()
  }

  const weekdaySet = new Set(values)
  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day)
    const weekday = date.getDay() === 0 ? 7 : date.getDay()
    if (weekdaySet.has(weekday)) {
      result.push(`${monthKey}-${String(day).padStart(2, '0')}`)
    }
  }
  return result
}

function resolveItemMonthBudgetMinor(item, monthKey) {
  const amountMode = normalizeAmountMode(item?.amount_mode)
  const amountMinor = Math.max(0, Math.round(Number(item?.amount_minor ?? 0) || 0))
  if (amountMode !== 'daily_average') return amountMinor
  const unit = normalizeDayRuleUnit(item?.day_rule_unit)
  const values = normalizeDayRuleValues(item?.day_rule_values ?? item?.day_rule_values_json, unit)
  if (unit === 'none' || values.length === 0) return 0
  return listMatchingDayKeys(monthKey, item).length * amountMinor
}

function buildSpentMinorMap(rows = []) {
  const map = new Map()
  for (const row of rows) {
    const categoryId = normalizeText(row?.category_id)
    if (!categoryId) continue
    map.set(categoryId, Math.max(0, Math.round(Number(row?.spent_minor ?? 0) || 0)))
  }
  return map
}

function toDueDateOccurredAt(dueDate, timeZone = 'Asia/Taipei') {
  const matched = String(dueDate ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return new Date().toISOString()

  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  return resolveZonedDateTimeUtcIso({ year, month, day, hour: 12, minute: 0, second: 0 }, timeZone)
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

function dayRangeUtc(dayKey, timeZone = 'Asia/Taipei') {
  const matched = String(dayKey ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) {
    const fallback = new Date().toISOString()
    return { startUtc: fallback, endUtc: fallback }
  }
  const startParts = {
    year: Number(matched[1]),
    month: Number(matched[2]),
    day: Number(matched[3]),
    hour: 0,
    minute: 0,
    second: 0,
  }
  const nextDayKey = shiftDayKey(dayKey, 1)
  const nextMatched = String(nextDayKey).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const endParts = nextMatched
    ? {
        year: Number(nextMatched[1]),
        month: Number(nextMatched[2]),
        day: Number(nextMatched[3]),
        hour: 0,
        minute: 0,
        second: 0,
      }
    : startParts
  return {
    startUtc: resolveZonedDateTimeUtcIso(startParts, timeZone),
    endUtc: resolveZonedDateTimeUtcIso(endParts, timeZone),
  }
}

function monthRangeUtc(monthKey, timeZone = 'Asia/Taipei') {
  const matched = String(monthKey ?? '').match(/^(\d{4})-(\d{2})$/)
  if (!matched) {
    const fallback = new Date().toISOString()
    return { startUtc: fallback, endUtc: fallback }
  }
  const year = Number(matched[1])
  const month = Number(matched[2])
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  return {
    startUtc: resolveZonedDateTimeUtcIso({ year, month, day: 1, hour: 0, minute: 0, second: 0 }, timeZone),
    endUtc: resolveZonedDateTimeUtcIso({ year: nextMonth.year, month: nextMonth.month, day: 1, hour: 0, minute: 0, second: 0 }, timeZone),
  }
}

function buildScopeBase(scopeType, scopeRefId, periodKey) {
  return `budget_save:${scopeType}:${scopeRefId}:${periodKey}`
}

function buildTransferNote(label) {
  return `預算存款：${label}`
}

function normalizeFinalSettlementStatus(expectedAmountMinor) {
  return expectedAmountMinor > 0 ? 'settled' : 'skipped_no_surplus'
}

function isFinalSettlementStatus(status) {
  return status === 'settled' || status === 'skipped_no_surplus'
}

function isSavingsJarAccount(account) {
  return Boolean(normalizeText(account?.savings_jar_goal_type))
}

function buildConfigStatus(config, accountMap) {
  if (!config?.enabled) {
    return { valid: false, reason: 'disabled' }
  }
  const sourceAccount = accountMap.get(config.sourceAccountId)
  const targetAccount = accountMap.get(config.targetAccountId)
  if (!targetAccount || !isSavingsJarAccount(targetAccount)) {
    return { valid: false, reason: 'target_invalid' }
  }
  if (!sourceAccount || isSavingsJarAccount(sourceAccount)) {
    return { valid: false, reason: 'source_invalid' }
  }
  if (config.sourceAccountId === config.targetAccountId) {
    return { valid: false, reason: 'same_account' }
  }
  const sourceCurrency = normalizeCurrencyCode(sourceAccount.currency_code, 'TWD')
  const targetCurrency = normalizeCurrencyCode(targetAccount.currency_code, sourceCurrency)
  if (sourceCurrency !== targetCurrency) {
    return { valid: false, reason: 'currency_mismatch' }
  }
  return {
    valid: true,
    sourceAccount,
    targetAccount,
  }
}

function readBudgetSaveConfig(raw = {}, mode = 'item') {
  if (mode === 'total') {
    return {
      enabled: normalizeBudgetSaveEnabled(raw?.budget_save_total_enabled),
      sourceAccountId: normalizeText(raw?.budget_save_total_source_account_id),
      targetAccountId: normalizeText(raw?.budget_save_total_target_account_id),
    }
  }
  if (mode === 'container') {
    return {
      enabled: normalizeBudgetSaveEnabled(raw?.budget_save_enabled),
      sourceAccountId: normalizeText(raw?.budget_save_source_account_id),
      targetAccountId: normalizeText(raw?.budget_save_target_account_id),
    }
  }
  return {
    enabled: normalizeBudgetSaveEnabled(raw?.budget_save_enabled),
    sourceAccountId: normalizeText(raw?.budget_save_source_account_id),
    targetAccountId: normalizeText(raw?.budget_save_target_account_id),
  }
}

export async function runBudgetSaveIfDue(ledgerId, options = {}) {
  if (!ledgerId) {
    throw new Error('缺少帳本 ID')
  }

  const now = options.now ?? new Date()
  const [ledger, budgets, accounts, balanceRows, preferences] = await Promise.all([
    dependencies.getLedger(ledgerId),
    dependencies.listBudgetsWithSaveRules(ledgerId),
    dependencies.listAccounts(ledgerId, { includeArchived: false }),
    dependencies.getAccountBalances(ledgerId, { includeArchived: false }),
    dependencies.getBudgetSavePreferences(ledgerId),
  ])

  const ledgerTimeZone = normalizeLedgerTimeZone(ledger?.timezone)
  const todayDayKey = buildDayKeyFromParts(getZonedDateParts(now, ledgerTimeZone))
  const currentMonthKey = todayDayKey.slice(0, 7)
  const accountMap = new Map(accounts.map((account) => [String(account.id), account]))
  const balanceMap = new Map(balanceRows.map((row) => [String(row.id), Number(row.balance_minor ?? 0)]))
  const retroactiveMode = normalizeText(preferences?.retroactiveMode) === 'delta' ? 'delta' : 'manual'

  let createdCount = 0
  let skippedCount = 0
  let failedCount = 0
  let settlementCount = 0
  const createdTransferGroupIds = []

  const daySpentCache = new Map()

  async function loadSpentMinorMapForDay(dayKey) {
    if (daySpentCache.has(dayKey)) return daySpentCache.get(dayKey)
    const { startUtc, endUtc } = dayRangeUtc(dayKey, ledgerTimeZone)
    const spentMap = buildSpentMinorMap(await dependencies.computeBudgetSpentByCategory(ledgerId, startUtc, endUtc))
    daySpentCache.set(dayKey, spentMap)
    return spentMap
  }

  async function createTransferIfNeeded({
    scopeType,
    scopeRefId,
    periodKey,
    fromAmountMinor,
    toAmountMinor,
    configStatus,
    label,
    dueDateKey,
  }) {
    const deltaAmountMinor = Math.abs(toAmountMinor - fromAmountMinor)
    if (deltaAmountMinor <= 0) {
      return { transferGroupId: null, created: false }
    }

    const baseKey = buildScopeBase(scopeType, scopeRefId, periodKey)
    const idempotencyKey = `${baseKey}:${fromAmountMinor}:${toAmountMinor}`
    const outgoing = toAmountMinor > fromAmountMinor
      ? configStatus.sourceAccount
      : configStatus.targetAccount
    const incoming = toAmountMinor > fromAmountMinor
      ? configStatus.targetAccount
      : configStatus.sourceAccount
    const outgoingBalance = Number(balanceMap.get(String(outgoing.id)) ?? 0)
    if (Number(outgoing.allow_negative ?? 0) !== 1 && outgoingBalance < deltaAmountMinor) {
      const error = new Error('insufficient_balance')
      error.code = 'insufficient_balance'
      throw error
    }

    const existing = await dependencies.findTransactionByIdempotencyKey(ledgerId, `${idempotencyKey}:out`)
    if (existing?.transfer_group_id) {
      return { transferGroupId: String(existing.transfer_group_id), created: false }
    }

    const transfer = await dependencies.createTransfer(ledgerId, {
      amountMinor: deltaAmountMinor,
      fromAccountId: outgoing.id,
      toAccountId: incoming.id,
      occurredAt: toDueDateOccurredAt(dueDateKey, ledgerTimeZone),
      note: buildTransferNote(label),
      originType: 'recurring',
      externalRefId: baseKey,
      idempotencyKey,
    })

    balanceMap.set(String(outgoing.id), outgoingBalance - deltaAmountMinor)
    balanceMap.set(String(incoming.id), Number(balanceMap.get(String(incoming.id)) ?? 0) + deltaAmountMinor)
    return { transferGroupId: String(transfer?.transferGroupId ?? ''), created: true }
  }

  async function finalizeSettlement({
    scopeType,
    scopeRefId,
    periodKey,
    expectedAmountMinor,
    configStatus,
    label,
    dueDateKey,
  }) {
    const existing = await dependencies.getBudgetSaveSettlement(ledgerId, scopeType, scopeRefId, periodKey)
    const currentSettledAmount = Math.max(0, Math.round(Number(existing?.settled_amount_minor ?? 0) || 0))
    const finalStatus = normalizeFinalSettlementStatus(expectedAmountMinor)
    const isManualLocked = retroactiveMode === 'manual'
      && existing
      && isFinalSettlementStatus(existing.status)

    if (isManualLocked) {
      skippedCount += 1
      return
    }

    if (retroactiveMode === 'manual' && existing?.status === 'settled' && currentSettledAmount > 0) {
      skippedCount += 1
      return
    }

    let transferGroupId = String(existing?.transfer_group_id ?? '').trim() || null

    try {
      const { transferGroupId: createdTransferGroupId, created } = await createTransferIfNeeded({
        scopeType,
        scopeRefId,
        periodKey,
        fromAmountMinor: retroactiveMode === 'delta' && isFinalSettlementStatus(existing?.status) ? currentSettledAmount : 0,
        toAmountMinor: expectedAmountMinor,
        configStatus,
        label,
        dueDateKey,
      })
      if (createdTransferGroupId) {
        transferGroupId = createdTransferGroupId
      }
      if (created) {
        createdCount += 1
        createdTransferGroupIds.push(createdTransferGroupId)
      } else if (expectedAmountMinor <= 0) {
        skippedCount += 1
      }

      await dependencies.upsertBudgetSaveSettlement(ledgerId, {
        scopeType,
        scopeRefId,
        periodKey,
        sourceAccountId: configStatus.sourceAccount.id,
        targetAccountId: configStatus.targetAccount.id,
        settledAmountMinor: expectedAmountMinor,
        status: finalStatus,
        transferGroupId,
        lastError: null,
      })
      settlementCount += 1
    } catch (error) {
      failedCount += 1
      await dependencies.upsertBudgetSaveSettlement(ledgerId, {
        scopeType,
        scopeRefId,
        periodKey,
        sourceAccountId: configStatus.sourceAccount?.id ?? null,
        targetAccountId: configStatus.targetAccount?.id ?? null,
        settledAmountMinor: currentSettledAmount,
        status: 'failed',
        transferGroupId,
        lastError: String(error?.code ?? error?.message ?? error ?? 'budget_save_failed'),
      })
    }
  }

  async function recordNonTransferSettlement({
    scopeType,
    scopeRefId,
    periodKey,
    config,
    status,
    lastError,
  }) {
    await dependencies.upsertBudgetSaveSettlement(ledgerId, {
      scopeType,
      scopeRefId,
      periodKey,
      sourceAccountId: config?.sourceAccountId ?? null,
      targetAccountId: config?.targetAccountId ?? null,
      settledAmountMinor: 0,
      status,
      transferGroupId: null,
      lastError,
    })
    settlementCount += 1
  }

  for (const budget of budgets) {
    const budgetMonthKey = normalizeText(budget.month_key)
    if (!budgetMonthKey) continue

    const items = await dependencies.listBudgetItems(ledgerId, budget.id)
    const containers = await dependencies.listBudgetContainers(ledgerId, budget.id)
    const { startUtc: budgetMonthStartUtc, endUtc: budgetMonthEndUtc } = monthRangeUtc(budgetMonthKey, ledgerTimeZone)
    const monthlySpentMap = buildSpentMinorMap(
      await dependencies.computeBudgetSpentByCategory(ledgerId, budgetMonthStartUtc, budgetMonthEndUtc),
    )

    const itemsByCategory = new Map()
    for (const item of items) {
      const categoryId = normalizeText(item?.category_id)
      if (!categoryId) continue
      if (!itemsByCategory.has(categoryId)) {
        itemsByCategory.set(categoryId, [])
      }
      itemsByCategory.get(categoryId).push(item)
    }

    const conflictCategoryIds = new Set(
      Array.from(itemsByCategory.entries())
        .filter(([, categoryItems]) => categoryItems.length > 1 && categoryItems.some((item) => normalizeBudgetSaveEnabled(item?.budget_save_enabled)))
        .map(([categoryId]) => categoryId),
    )

    const containerSaveEnabledIds = new Set(
      containers
        .filter((container) => normalizeBudgetSaveEnabled(container?.budget_save_enabled))
        .map((container) => String(container.id)),
    )

    for (const item of items) {
      if (!normalizeBudgetSaveEnabled(item?.budget_save_enabled)) continue
      const parentContainerId = normalizeText(item?.budget_container_id)
      if (parentContainerId && containerSaveEnabledIds.has(parentContainerId)) {
        continue
      }
      const categoryId = normalizeText(item?.category_id)
      const config = readBudgetSaveConfig(item, 'item')
      const scopeRefId = String(item.id)
      const itemLabel = normalizeText(item?.category_name) || categoryId || scopeRefId

      if (conflictCategoryIds.has(categoryId)) {
        if (normalizeAmountMode(item?.amount_mode) === 'daily_average') {
          const dueDayKeys = listMatchingDayKeys(budgetMonthKey, item).filter((dayKey) => dayKey < todayDayKey)
          for (const periodKey of dueDayKeys) {
            await recordNonTransferSettlement({
              scopeType: 'budget_item_day',
              scopeRefId,
              periodKey,
              config,
              status: 'conflict',
              lastError: 'budget_save_conflict',
            })
          }
        } else if (compareMonthKey(budgetMonthKey, currentMonthKey) < 0) {
          await recordNonTransferSettlement({
            scopeType: 'budget_item_month',
            scopeRefId,
            periodKey: budgetMonthKey,
            config,
            status: 'conflict',
            lastError: 'budget_save_conflict',
          })
        }
        continue
      }

      const configStatus = buildConfigStatus(config, accountMap)
      if (!configStatus.valid) {
        if (normalizeAmountMode(item?.amount_mode) === 'daily_average') {
          const dueDayKeys = listMatchingDayKeys(budgetMonthKey, item).filter((dayKey) => dayKey < todayDayKey)
          for (const periodKey of dueDayKeys) {
            await recordNonTransferSettlement({
              scopeType: 'budget_item_day',
              scopeRefId,
              periodKey,
              config,
              status: 'invalid_config',
              lastError: configStatus.reason,
            })
          }
        } else if (compareMonthKey(budgetMonthKey, currentMonthKey) < 0) {
          await recordNonTransferSettlement({
            scopeType: 'budget_item_month',
            scopeRefId,
            periodKey: budgetMonthKey,
            config,
            status: 'invalid_config',
            lastError: configStatus.reason,
          })
        }
        continue
      }

      if (normalizeAmountMode(item?.amount_mode) === 'daily_average') {
        const dueDayKeys = listMatchingDayKeys(budgetMonthKey, item).filter((dayKey) => dayKey < todayDayKey)
        for (const periodKey of dueDayKeys) {
          const daySpentMap = await loadSpentMinorMapForDay(periodKey)
          const expectedAmountMinor = Math.max(0, Math.round(Number(item?.amount_minor ?? 0) || 0) - Number(daySpentMap.get(categoryId) ?? 0))
          await finalizeSettlement({
            scopeType: 'budget_item_day',
            scopeRefId,
            periodKey,
            expectedAmountMinor,
            configStatus,
            label: `${itemLabel} ${periodKey}`,
            dueDateKey: periodKey,
          })
        }
        continue
      }

      if (compareMonthKey(budgetMonthKey, currentMonthKey) < 0) {
        const expectedAmountMinor = Math.max(0, Math.round(Number(item?.amount_minor ?? 0) || 0) - Number(monthlySpentMap.get(categoryId) ?? 0))
        await finalizeSettlement({
          scopeType: 'budget_item_month',
          scopeRefId,
          periodKey: budgetMonthKey,
          expectedAmountMinor,
          configStatus,
          label: `${itemLabel} ${budgetMonthKey}`,
          dueDateKey: buildMonthLastDayKey(budgetMonthKey),
        })
      }
    }

    for (const container of containers) {
      if (!normalizeBudgetSaveEnabled(container?.budget_save_enabled)) continue
      if (compareMonthKey(budgetMonthKey, currentMonthKey) >= 0) continue

      const config = readBudgetSaveConfig(container, 'container')
      const scopeRefId = String(container.id)
      const containerLabel = normalizeText(container?.name) || scopeRefId
      const configStatus = buildConfigStatus(config, accountMap)
      if (!configStatus.valid) {
        await recordNonTransferSettlement({
          scopeType: 'budget_container_month',
          scopeRefId,
          periodKey: budgetMonthKey,
          config,
          status: 'invalid_config',
          lastError: configStatus.reason,
        })
        continue
      }

      const childItems = items.filter(
        (item) => String(item?.budget_container_id ?? '') === scopeRefId,
      )
      let containerSpentMinor = 0
      for (const item of childItems) {
        const categoryId = normalizeText(item?.category_id)
        if (!categoryId) continue
        containerSpentMinor += Number(monthlySpentMap.get(categoryId) ?? 0)
      }
      const containerAmountMinor = resolveContainerMonthlyAmountMinor(container, budgetMonthKey)
      const expectedAmountMinor = Math.max(0, containerAmountMinor - containerSpentMinor)

      await finalizeSettlement({
        scopeType: 'budget_container_month',
        scopeRefId,
        periodKey: budgetMonthKey,
        expectedAmountMinor,
        configStatus,
        label: `${containerLabel} ${budgetMonthKey}`,
        dueDateKey: buildMonthLastDayKey(budgetMonthKey),
      })
    }

    const totalConfig = readBudgetSaveConfig(budget, 'total')
    if (!totalConfig.enabled || compareMonthKey(budgetMonthKey, currentMonthKey) >= 0) {
      continue
    }

    const totalConfigStatus = buildConfigStatus(totalConfig, accountMap)
    if (!totalConfigStatus.valid) {
      await recordNonTransferSettlement({
        scopeType: 'budget_total_month',
        scopeRefId: String(budget.id),
        periodKey: budgetMonthKey,
        config: totalConfig,
        status: 'invalid_config',
        lastError: totalConfigStatus.reason,
      })
      continue
    }

    const excludedCategoryIds = new Set(conflictCategoryIds)
    for (const [categoryId, categoryItems] of itemsByCategory.entries()) {
      if (categoryItems.some((item) => normalizeBudgetSaveEnabled(item?.budget_save_enabled))) {
        excludedCategoryIds.add(categoryId)
      }
    }
    for (const container of containers) {
      if (!normalizeBudgetSaveEnabled(container?.budget_save_enabled)) continue
      for (const item of items) {
        if (String(item?.budget_container_id ?? '') !== String(container.id)) continue
        const categoryId = normalizeText(item?.category_id)
        if (categoryId) excludedCategoryIds.add(categoryId)
      }
    }

    let totalExpectedAmountMinor = 0
    for (const [categoryId, categoryItems] of itemsByCategory.entries()) {
      if (excludedCategoryIds.has(categoryId)) continue
      const categoryBudgetMinor = categoryItems.reduce(
        (total, item) => total + resolveItemMonthBudgetMinor(item, budgetMonthKey),
        0,
      )
      const categoryRemainMinor = Math.max(0, categoryBudgetMinor - Number(monthlySpentMap.get(categoryId) ?? 0))
      totalExpectedAmountMinor += categoryRemainMinor
    }

    await finalizeSettlement({
      scopeType: 'budget_total_month',
      scopeRefId: String(budget.id),
      periodKey: budgetMonthKey,
      expectedAmountMinor: totalExpectedAmountMinor,
      configStatus: totalConfigStatus,
      label: `${budgetMonthKey} 總預算`,
      dueDateKey: buildMonthLastDayKey(budgetMonthKey),
    })
  }

  return {
    createdCount,
    skippedCount,
    failedCount,
    settlementCount,
    createdTransferGroupIds,
    retroactiveMode,
  }
}
