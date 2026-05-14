import {
  listSubscriptionChargeDatesThrough,
  normalizeSubscriptionChargeDay,
  normalizeSubscriptionDateInput,
} from '../utils/subscription-schedule.js'

const defaultDependencies = {
  async listAccounts(...args) {
    const mod = await import('../repositories/account.repo.js')
    return mod.listAccounts(...args)
  },
  async getLedger(...args) {
    const mod = await import('../repositories/ledger.repo.js')
    return mod.getLedger(...args)
  },
  async findTransactionByIdempotencyKey(...args) {
    const mod = await import('../repositories/transaction.repo.js')
    return mod.findTransactionByIdempotencyKey(...args)
  },
  async createTransfer(...args) {
    const mod = await import('./transaction.service.js')
    return mod.createTransfer(...args)
  },
}

const dependencies = { ...defaultDependencies }

export function setSavingsJarAutoSaveDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

export function resetSavingsJarAutoSaveDependenciesForTest() {
  Object.assign(dependencies, defaultDependencies)
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeCurrencyCode(value, fallback = 'TWD') {
  const text = normalizeText(value).toUpperCase()
  return /^[A-Z]{3}$/.test(text) ? text : fallback
}

function isSavingsJarAccount(account) {
  return Boolean(normalizeText(account?.savings_jar_goal_type))
}

function readAutoSaveItem(account) {
  const sourceAccountId = normalizeText(account?.savings_jar_auto_save_source_account_id)
  const amountMinor = Math.round(Number(account?.savings_jar_auto_save_amount_minor) || 0)
  const startDate = normalizeSubscriptionDateInput(account?.savings_jar_auto_save_start_date)
  if (!sourceAccountId || amountMinor <= 0 || !startDate) {
    return null
  }

  const intervalUnit = normalizeText(account?.savings_jar_auto_save_interval_unit).toLowerCase() === 'year'
    ? 'year'
    : normalizeText(account?.savings_jar_auto_save_interval_unit).toLowerCase() === 'day'
      ? 'day'
      : 'month'

  return {
    sourceAccountId,
    amountMinor,
    intervalValue: Math.max(1, Math.trunc(Number(account?.savings_jar_auto_save_interval_value) || 1)),
    intervalUnit,
    startDate,
    chargeDay: intervalUnit === 'month'
      ? normalizeSubscriptionChargeDay(account?.savings_jar_auto_save_charge_day, startDate)
      : null,
    paused: Number(account?.savings_jar_auto_save_paused ?? 0) === 1,
  }
}

function buildAutoSaveExternalRefId(jarId) {
  return `sjar_auto:${jarId}`
}

function buildAutoSaveIdempotencyKey(jarId, dueDate) {
  return `sjar_auto:${jarId}:${dueDate}`
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

function getZonedDateTimeParts(epochMs, timeZone) {
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
  const parts = formatter.formatToParts(new Date(epochMs))
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

function toDueDateOccurredAt(dueDate, timeZone = 'Asia/Taipei') {
  const matched = String(dueDate ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!matched) return new Date().toISOString()

  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const desiredEpochMs = Date.UTC(year, month - 1, day, 12, 0, 0)
  let resolvedEpochMs = desiredEpochMs

  for (let index = 0; index < 3; index += 1) {
    const actual = getZonedDateTimeParts(resolvedEpochMs, timeZone)
    const actualEpochMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
    const diffMs = desiredEpochMs - actualEpochMs
    if (diffMs === 0) break
    resolvedEpochMs += diffMs
  }

  return new Date(resolvedEpochMs).toISOString()
}

function isSourceAccountValid(sourceAccount, jarAccount) {
  if (!sourceAccount || !jarAccount) return false
  if (String(sourceAccount.id) === String(jarAccount.id)) return false
  if (isSavingsJarAccount(sourceAccount)) return false
  return normalizeCurrencyCode(sourceAccount.currency_code, 'TWD') === normalizeCurrencyCode(jarAccount.currency_code, 'TWD')
}

export async function runSavingsJarAutoSaveIfDue(ledgerId, options = {}) {
  if (!ledgerId) {
    throw new Error('缺少帳本 ID')
  }

  const now = options.now ?? new Date()
  const ledger = await dependencies.getLedger(ledgerId)
  const ledgerTimeZone = normalizeLedgerTimeZone(ledger?.timezone)
  const accounts = await dependencies.listAccounts(ledgerId, { includeArchived: false })
  const accountMap = new Map(accounts.map((account) => [String(account.id), account]))
  const savingsJarAccounts = accounts.filter((account) => isSavingsJarAccount(account))
  const pendingRuns = []
  let skippedCount = 0

  for (const jarAccount of savingsJarAccounts) {
    const autoSave = readAutoSaveItem(jarAccount)
    if (!autoSave || autoSave.paused) continue

    const sourceAccount = accountMap.get(autoSave.sourceAccountId)
    if (!isSourceAccountValid(sourceAccount, jarAccount)) {
      skippedCount += 1
      continue
    }

    const dueDates = listSubscriptionChargeDatesThrough(autoSave, now, { timeZone: ledgerTimeZone })
    for (const dueDate of dueDates) {
      pendingRuns.push({
        jarAccount,
        autoSave,
        dueDate,
      })
    }
  }

  pendingRuns.sort((left, right) => {
    const dateCompare = left.dueDate.localeCompare(right.dueDate)
    if (dateCompare !== 0) return dateCompare
    return String(left.jarAccount.id).localeCompare(String(right.jarAccount.id))
  })

  const createdTransferGroupIds = []
  let createdCount = 0
  let failedCount = 0

  for (const run of pendingRuns) {
    const jarId = String(run.jarAccount.id)
    const idempotencyKey = buildAutoSaveIdempotencyKey(jarId, run.dueDate)
    const existing = await dependencies.findTransactionByIdempotencyKey(ledgerId, `${idempotencyKey}:out`)
    if (existing) continue

    try {
      const transfer = await dependencies.createTransfer(ledgerId, {
        amountMinor: run.autoSave.amountMinor,
        fromAccountId: run.autoSave.sourceAccountId,
        toAccountId: jarId,
        occurredAt: toDueDateOccurredAt(run.dueDate, ledgerTimeZone),
        note: `自動存錢：${run.jarAccount.name}`,
        originType: 'recurring',
        externalRefId: buildAutoSaveExternalRefId(jarId),
        idempotencyKey,
      })
      createdCount += 1
      if (transfer?.transferGroupId) {
        createdTransferGroupIds.push(String(transfer.transferGroupId))
      }
    } catch (error) {
      failedCount += 1
      console.warn('[savings-jar-auto-save] create transfer failed', {
        ledgerId,
        jarId,
        dueDate: run.dueDate,
        error,
      })
    }
  }

  return {
    createdCount,
    skippedCount,
    failedCount,
    createdTransferGroupIds,
  }
}
