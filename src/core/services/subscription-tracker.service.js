import { getSetting, setSetting } from '@/core/repositories/settings.repo'
import { createId } from '@/core/utils/id'
import { assertCanCreateSubscription } from '@/core/services/membership.service'

const SUBSCRIPTION_TRACKER_KEY = 'subscription_tracker.items'

function ensureLedgerId(ledgerId) {
  if (!ledgerId) {
    throw new Error('缺少帳本 ID')
  }
}

function normalizeUnit(value) {
  const unit = String(value ?? '').trim().toLowerCase()
  if (unit === 'year') return 'year'
  if (unit === 'day') return 'day'
  return 'month'
}

function normalizeAmountMinor(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.round(parsed))
}

function addInterval(baseDateLike, intervalValue, intervalUnit) {
  const baseDate = new Date(baseDateLike)
  if (Number.isNaN(baseDate.getTime())) {
    return new Date().toISOString()
  }

  const next = new Date(baseDate)
  const step = Math.max(1, Number(intervalValue) || 1)
  const unit = normalizeUnit(intervalUnit)

  if (unit === 'year') {
    next.setFullYear(next.getFullYear() + step)
  } else if (unit === 'day') {
    next.setDate(next.getDate() + step)
  } else {
    next.setMonth(next.getMonth() + step)
  }

  return next.toISOString()
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = String(raw.name ?? '').trim()
  const accountId = String(raw.accountId ?? '').trim()
  if (!name || !accountId) return null

  const intervalValue = Math.max(1, Number(raw.intervalValue ?? 1) || 1)
  const intervalUnit = normalizeUnit(raw.intervalUnit)
  const lastPaidAt = String(raw.lastPaidAt ?? '').trim()
  const nextDueAt = String(raw.nextDueAt ?? '').trim() || addInterval(new Date(), intervalValue, intervalUnit)
  const amountMinor = normalizeAmountMinor(raw.amountMinor)

  return {
    id: String(raw.id ?? createId('sub')).trim() || createId('sub'),
    name,
    intervalValue,
    intervalUnit,
    amountMinor,
    accountId,
    createdAt: String(raw.createdAt ?? '').trim() || new Date().toISOString(),
    lastPaidAt,
    nextDueAt,
  }
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return []
  return rawItems
    .map((item) => normalizeItem(item))
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.nextDueAt || 0) - Date.parse(b.nextDueAt || 0))
}

async function saveItems(ledgerId, items) {
  ensureLedgerId(ledgerId)
  const normalized = normalizeItems(items)
  await setSetting(ledgerId, SUBSCRIPTION_TRACKER_KEY, normalized)
  return normalized
}

export async function getSubscriptionItems(ledgerId) {
  ensureLedgerId(ledgerId)
  const stored = await getSetting(ledgerId, SUBSCRIPTION_TRACKER_KEY)
  return normalizeItems(stored)
}

export async function upsertSubscriptionItem(ledgerId, item) {
  ensureLedgerId(ledgerId)
  const normalized = normalizeItem(item)
  if (!normalized) {
    throw new Error('訂閱項目資料不完整')
  }

  const current = await getSubscriptionItems(ledgerId)
  const exists = current.some((entry) => entry.id === normalized.id)
  if (!exists) {
    assertCanCreateSubscription(current.length)
  }

  const next = current.filter((entry) => entry.id !== normalized.id)
  next.push(normalized)
  return saveItems(ledgerId, next)
}

export async function removeSubscriptionItem(ledgerId, itemId) {
  ensureLedgerId(ledgerId)
  const current = await getSubscriptionItems(ledgerId)
  const next = current.filter((item) => item.id !== String(itemId ?? '').trim())
  return saveItems(ledgerId, next)
}

export async function markSubscriptionPaid(ledgerId, itemId, paidAt = new Date()) {
  ensureLedgerId(ledgerId)
  const targetId = String(itemId ?? '').trim()
  const current = await getSubscriptionItems(ledgerId)
  const next = current.map((item) => {
    if (item.id !== targetId) return item
    const paidAtIso = new Date(paidAt).toISOString()
    return {
      ...item,
      lastPaidAt: paidAtIso,
      nextDueAt: addInterval(paidAtIso, item.intervalValue, item.intervalUnit),
    }
  })
  return saveItems(ledgerId, next)
}

export function describeSubscriptionInterval(item) {
  const intervalValue = Math.max(1, Number(item?.intervalValue ?? 1) || 1)
  const intervalUnit = normalizeUnit(item?.intervalUnit)
  if (intervalUnit === 'year') return `${intervalValue}年`
  if (intervalUnit === 'day') return `${intervalValue}日`
  return `${intervalValue}月`
}

export function isSubscriptionDue(item, now = new Date()) {
  const nextDueMs = Date.parse(String(item?.nextDueAt ?? ''))
  const nowMs = new Date(now).getTime()
  if (!Number.isFinite(nextDueMs) || !Number.isFinite(nowMs)) return false
  return nextDueMs <= nowMs
}
