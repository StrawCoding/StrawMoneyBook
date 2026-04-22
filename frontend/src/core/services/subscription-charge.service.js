import {
  listSubscriptionChargeDatesThrough,
  toSubscriptionDateInput,
} from '../utils/subscription-schedule.js'

const defaultDependencies = {
  async getSubscriptionItems(...args) {
    const mod = await import('./subscription-tracker.service.js')
    return mod.getSubscriptionItems(...args)
  },
  async getLedger(...args) {
    const mod = await import('../repositories/ledger.repo.js')
    return mod.getLedger(...args)
  },
  async findTransactionByIdempotencyKey(...args) {
    const mod = await import('../repositories/transaction.repo.js')
    return mod.findTransactionByIdempotencyKey(...args)
  },
  async createExpense(...args) {
    const mod = await import('./transaction.service.js')
    return mod.createExpense(...args)
  },
}

const dependencies = { ...defaultDependencies }
const activeRunsByLedger = new Map()

export function setSubscriptionChargeDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

export function resetSubscriptionChargeDependenciesForTest() {
  Object.assign(dependencies, defaultDependencies)
  activeRunsByLedger.clear()
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeAmountMinor(value) {
  const amount = Math.round(Number(value) || 0)
  return Number.isFinite(amount) ? Math.max(0, amount) : 0
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

function buildSubscriptionChargeExternalRefId(subscriptionId) {
  return `subscription:${subscriptionId}`
}

function buildSubscriptionChargeIdempotencyKey(subscriptionId, dueDate) {
  return `subscription:${subscriptionId}:${dueDate}`
}

function buildSubscriptionChargeNote(item) {
  const name = normalizeText(item?.name) || '訂閱項目'
  const note = normalizeText(item?.note)
  return note ? `訂閱扣款：${name}\n${note}` : `訂閱扣款：${name}`
}

function getTodayDueDate(item, now) {
  const today = toSubscriptionDateInput(now)
  if (!today) return ''
  const dueDates = listSubscriptionChargeDatesThrough(item, now, { maxOccurrences: 1200 })
  return dueDates.includes(today) ? today : ''
}

function shouldSkipItem(item) {
  return !normalizeText(item?.id)
    || !normalizeText(item?.accountId)
    || !normalizeText(item?.categoryId)
    || normalizeAmountMinor(item?.amountMinor) <= 0
    || Boolean(item?.paused)
}

async function executeSubscriptionChargesIfDue(ledgerId, options = {}) {
  const normalizedLedgerId = normalizeText(ledgerId)
  if (!normalizedLedgerId) {
    throw new Error('缺少帳本 ID')
  }

  const now = options.now ?? new Date()
  const [ledger, items] = await Promise.all([
    dependencies.getLedger(normalizedLedgerId),
    dependencies.getSubscriptionItems(normalizedLedgerId),
  ])
  const ledgerTimeZone = normalizeLedgerTimeZone(ledger?.timezone)
  const pendingRuns = []
  let skippedCount = 0

  for (const item of items) {
    if (shouldSkipItem(item)) {
      skippedCount += 1
      continue
    }

    const dueDate = getTodayDueDate(item, now)
    if (!dueDate) continue

    pendingRuns.push({ item, dueDate })
  }

  pendingRuns.sort((left, right) => {
    const dateCompare = left.dueDate.localeCompare(right.dueDate)
    if (dateCompare !== 0) return dateCompare
    return String(left.item.id).localeCompare(String(right.item.id))
  })

  const createdTransactionIds = []
  let createdCount = 0
  let failedCount = 0

  for (const run of pendingRuns) {
    const subscriptionId = normalizeText(run.item.id)
    const idempotencyKey = buildSubscriptionChargeIdempotencyKey(subscriptionId, run.dueDate)
    const existing = await dependencies.findTransactionByIdempotencyKey(normalizedLedgerId, idempotencyKey)
    if (existing) continue

    try {
      const transactionId = await dependencies.createExpense(normalizedLedgerId, {
        accountId: normalizeText(run.item.accountId),
        categoryId: normalizeText(run.item.categoryId),
        amountMinor: normalizeAmountMinor(run.item.amountMinor),
        occurredAt: toDueDateOccurredAt(run.dueDate, ledgerTimeZone),
        note: buildSubscriptionChargeNote(run.item),
        originType: 'recurring',
        externalRefId: buildSubscriptionChargeExternalRefId(subscriptionId),
        idempotencyKey,
      })
      createdCount += 1
      if (transactionId) {
        createdTransactionIds.push(String(transactionId))
      }
    } catch (error) {
      failedCount += 1
      console.warn('[subscription-charge] create expense failed', {
        ledgerId: normalizedLedgerId,
        subscriptionId,
        dueDate: run.dueDate,
        error,
      })
    }
  }

  return {
    createdCount,
    skippedCount,
    failedCount,
    createdTransactionIds,
  }
}

export async function runSubscriptionChargesIfDue(ledgerId, options = {}) {
  const normalizedLedgerId = normalizeText(ledgerId)
  if (!normalizedLedgerId) {
    throw new Error('缺少帳本 ID')
  }

  const activeRun = activeRunsByLedger.get(normalizedLedgerId)
  if (activeRun) {
    if (options?.rerunAfterCurrent) {
      return activeRun.then(() => runSubscriptionChargesIfDue(normalizedLedgerId, {
        ...options,
        rerunAfterCurrent: false,
      }))
    }
    return activeRun
  }

  const run = executeSubscriptionChargesIfDue(normalizedLedgerId, options)
    .finally(() => {
      if (activeRunsByLedger.get(normalizedLedgerId) === run) {
        activeRunsByLedger.delete(normalizedLedgerId)
      }
    })
  activeRunsByLedger.set(normalizedLedgerId, run)
  return run
}
