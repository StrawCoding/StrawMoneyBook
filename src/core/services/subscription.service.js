import { createExpense } from '@/core/services/transaction.service'
import { getSetting, setSetting } from '@/core/repositories/settings.repo'
import { createId, nowIso } from '@/core/utils/id'

const SUBSCRIPTION_SETTINGS_KEY = 'feature.subscriptions'
const MAX_SUBSCRIPTION_ITEMS = 200
const ALLOWED_INTERVAL_UNITS = new Set(['day', 'month', 'year'])

function assertLedgerId(ledgerId) {
  if (!String(ledgerId ?? '').trim()) {
    throw new Error('缺少帳本 ID')
  }
}

function todayDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizeDateKey(value) {
  const raw = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  const d = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return raw
}

function parseDateKey(dateKey) {
  const normalized = normalizeDateKey(dateKey)
  if (!normalized) return null
  const [y, m, d] = normalized.split('-').map((part) => Number(part))
  // Use noon to avoid timezone/date-shift issues around midnight boundaries.
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

function dateKeyFromDate(date) {
  return todayDateKey(date)
}

function addInterval(dateKey, intervalValue, intervalUnit) {
  const base = parseDateKey(dateKey)
  if (!base) return todayDateKey()
  const amount = Math.max(1, Math.floor(Number(intervalValue) || 1))
  const unit = ALLOWED_INTERVAL_UNITS.has(intervalUnit) ? intervalUnit : 'month'

  if (unit === 'day') {
    base.setDate(base.getDate() + amount)
    return dateKeyFromDate(base)
  }
  if (unit === 'year') {
    base.setFullYear(base.getFullYear() + amount)
    return dateKeyFromDate(base)
  }
  base.setMonth(base.getMonth() + amount)
  return dateKeyFromDate(base)
}

function intervalLabel(subscription) {
  const value = Math.max(1, Math.floor(Number(subscription.intervalValue) || 1))
  if (subscription.intervalUnit === 'day') return `每 ${value} 天`
  if (subscription.intervalUnit === 'year') return `每 ${value} 年`
  return `每 ${value} 月`
}

function normalizeIntervalUnit(value) {
  const unit = String(value ?? 'month').trim().toLowerCase()
  return ALLOWED_INTERVAL_UNITS.has(unit) ? unit : 'month'
}

function normalizeSubscription(item) {
  const now = nowIso()
  const nextDate = normalizeDateKey(item?.nextChargeDate) || todayDateKey()
  const amountMinor = Math.abs(Math.round(Number(item?.amountMinor ?? 0)))
  const intervalValue = Math.max(1, Math.floor(Number(item?.intervalValue ?? 1) || 1))
  const intervalUnit = normalizeIntervalUnit(item?.intervalUnit)

  return {
    id: String(item?.id ?? '').trim() || createId('sub'),
    name: String(item?.name ?? '').trim() || '未命名訂閱',
    amountMinor,
    accountId: String(item?.accountId ?? '').trim(),
    categoryId: String(item?.categoryId ?? '').trim(),
    intervalValue,
    intervalUnit,
    nextChargeDate: nextDate,
    enabled: item?.enabled !== false,
    note: String(item?.note ?? '').trim(),
    lastChargedAt: String(item?.lastChargedAt ?? ''),
    createdAt: String(item?.createdAt ?? '') || now,
    updatedAt: String(item?.updatedAt ?? '') || now,
  }
}

function normalizeSubscriptionState(raw) {
  const source = Array.isArray(raw?.items) ? raw.items : []
  const items = source
    .map((item) => normalizeSubscription(item))
    .slice(0, MAX_SUBSCRIPTION_ITEMS)
    .sort((a, b) => {
      if (a.nextChargeDate !== b.nextChargeDate) {
        return a.nextChargeDate < b.nextChargeDate ? -1 : 1
      }
      return a.createdAt < b.createdAt ? -1 : 1
    })

  return { items }
}

async function loadSubscriptionState(ledgerId) {
  assertLedgerId(ledgerId)
  const raw = await getSetting(ledgerId, SUBSCRIPTION_SETTINGS_KEY)
  return normalizeSubscriptionState(raw)
}

async function saveSubscriptionState(ledgerId, state) {
  assertLedgerId(ledgerId)
  const normalized = normalizeSubscriptionState(state)
  await setSetting(ledgerId, SUBSCRIPTION_SETTINGS_KEY, normalized)
  return normalized
}

function toOccurredAtIso(dateKey) {
  const parsed = parseDateKey(dateKey)
  if (!parsed) return new Date().toISOString()
  return parsed.toISOString()
}

function buildChargeNote(subscription, occurredDateKey) {
  const title = String(subscription.name ?? '').trim() || '未命名訂閱'
  const prefix = `[訂閱] ${title}`
  const note = String(subscription.note ?? '').trim()
  if (!note) return `${prefix}（${occurredDateKey}）`
  return `${prefix}（${occurredDateKey}）\n${note}`
}

async function chargeSubscriptionByDate(ledgerId, subscription, occurredDateKey) {
  if (!subscription.accountId) throw new Error(`訂閱「${subscription.name}」缺少扣款帳戶`)
  if (!subscription.categoryId) throw new Error(`訂閱「${subscription.name}」缺少支出分類`)
  if (subscription.amountMinor <= 0) throw new Error(`訂閱「${subscription.name}」金額需大於 0`)

  await createExpense(ledgerId, {
    accountId: subscription.accountId,
    categoryId: subscription.categoryId,
    amountMinor: subscription.amountMinor,
    occurredAt: toOccurredAtIso(occurredDateKey),
    note: buildChargeNote(subscription, occurredDateKey),
    isReimbursable: false,
    includeInBudget: true,
    includeInAnalysis: true,
    originType: 'recurring',
  })
}

export async function listSubscriptions(ledgerId) {
  const state = await loadSubscriptionState(ledgerId)
  return state.items.map((item) => ({
    ...item,
    intervalLabel: intervalLabel(item),
  }))
}

export async function upsertSubscription(ledgerId, payload, subscriptionId = '') {
  const state = await loadSubscriptionState(ledgerId)
  const targetId = String(subscriptionId ?? payload?.id ?? '').trim()
  const current = state.items.find((item) => item.id === targetId) ?? null
  const now = nowIso()
  const nextItem = normalizeSubscription({
    ...current,
    ...payload,
    id: targetId || current?.id || undefined,
    updatedAt: now,
    createdAt: current?.createdAt ?? payload?.createdAt ?? now,
  })

  const index = state.items.findIndex((item) => item.id === nextItem.id)
  if (index >= 0) {
    nextItem.createdAt = state.items[index].createdAt || nextItem.createdAt
    state.items.splice(index, 1, nextItem)
  } else {
    state.items.unshift(nextItem)
  }

  await saveSubscriptionState(ledgerId, state)
  return {
    ...nextItem,
    intervalLabel: intervalLabel(nextItem),
  }
}

export async function deleteSubscription(ledgerId, subscriptionId) {
  const id = String(subscriptionId ?? '').trim()
  if (!id) return false
  const state = await loadSubscriptionState(ledgerId)
  const nextItems = state.items.filter((item) => item.id !== id)
  if (nextItems.length === state.items.length) return false
  await saveSubscriptionState(ledgerId, { items: nextItems })
  return true
}

export async function toggleSubscriptionEnabled(ledgerId, subscriptionId, enabled) {
  const id = String(subscriptionId ?? '').trim()
  if (!id) throw new Error('缺少訂閱 ID')
  const state = await loadSubscriptionState(ledgerId)
  const index = state.items.findIndex((item) => item.id === id)
  if (index < 0) throw new Error('找不到訂閱項目')
  const current = state.items[index]
  const next = {
    ...current,
    enabled: Boolean(enabled),
    updatedAt: nowIso(),
  }
  state.items.splice(index, 1, next)
  await saveSubscriptionState(ledgerId, state)
  return {
    ...next,
    intervalLabel: intervalLabel(next),
  }
}

export async function chargeSubscriptionNow(ledgerId, subscriptionId, occurredAt = new Date()) {
  const id = String(subscriptionId ?? '').trim()
  if (!id) throw new Error('缺少訂閱 ID')
  const state = await loadSubscriptionState(ledgerId)
  const index = state.items.findIndex((item) => item.id === id)
  if (index < 0) throw new Error('找不到訂閱項目')
  const target = state.items[index]
  const chargeDateKey = todayDateKey(occurredAt) || todayDateKey()

  await chargeSubscriptionByDate(ledgerId, target, chargeDateKey)

  const next = {
    ...target,
    lastChargedAt: nowIso(),
    nextChargeDate: addInterval(chargeDateKey, target.intervalValue, target.intervalUnit),
    updatedAt: nowIso(),
  }
  state.items.splice(index, 1, next)
  await saveSubscriptionState(ledgerId, state)
  return {
    ...next,
    intervalLabel: intervalLabel(next),
  }
}

export async function runDueSubscriptionCharges(ledgerId, options = {}) {
  const state = await loadSubscriptionState(ledgerId)
  const asOfDateKey = todayDateKey(options.asOfDate ?? new Date()) || todayDateKey()
  let chargedCount = 0
  const errors = []
  let changed = false

  for (let index = 0; index < state.items.length; index += 1) {
    const item = state.items[index]
    if (!item.enabled) continue
    if (!item.nextChargeDate || item.nextChargeDate > asOfDateKey) continue

    let guard = 0
    let nextItem = { ...item }
    while (nextItem.enabled && nextItem.nextChargeDate <= asOfDateKey) {
      if (guard >= 60) {
        errors.push(`訂閱「${nextItem.name}」補扣次數過多，請檢查設定`)
        break
      }
      try {
        await chargeSubscriptionByDate(ledgerId, nextItem, nextItem.nextChargeDate)
        chargedCount += 1
        changed = true
      } catch (error) {
        errors.push(String(error?.message ?? error ?? `訂閱「${nextItem.name}」扣款失敗`))
        break
      }

      nextItem = {
        ...nextItem,
        lastChargedAt: nowIso(),
        nextChargeDate: addInterval(nextItem.nextChargeDate, nextItem.intervalValue, nextItem.intervalUnit),
        updatedAt: nowIso(),
      }
      guard += 1
    }
    state.items[index] = nextItem
  }

  if (changed) {
    await saveSubscriptionState(ledgerId, state)
  }

  return {
    chargedCount,
    errors,
  }
}
