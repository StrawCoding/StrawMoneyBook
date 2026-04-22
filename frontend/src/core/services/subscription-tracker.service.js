import { getSetting, setSetting } from '../repositories/settings.repo.js'
import { createId } from '../utils/id.js'
import { assertCanCreateSubscription } from './membership.service.js'
import {
  normalizeSubscriptionChargeDay as normalizeChargeDay,
  normalizeSubscriptionDateInput,
  resolveSubscriptionNextChargeDate,
  isSubscriptionChargeDue,
  toSubscriptionDateInput,
} from '../utils/subscription-schedule.js'

const SUBSCRIPTION_TRACKER_KEY = 'subscription_tracker.items'
const defaultDependencies = {
  getSetting,
  setSetting,
  assertCanCreateSubscription,
}
const dependencies = { ...defaultDependencies }

export function resetSubscriptionTrackerDependenciesForTest() {
  Object.assign(dependencies, defaultDependencies)
}

export function setSubscriptionTrackerDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

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

function normalizePaused(value) {
  if (typeof value === 'boolean') return value
  const text = String(value ?? '').trim().toLowerCase()
  return text === '1' || text === 'true' || text === 'yes' || text === 'on'
}

function normalizeNote(value) {
  return String(value ?? '').trim()
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = String(raw.name ?? '').trim()
  const accountId = String(raw.accountId ?? '').trim()
  if (!name || !accountId) return null

  const intervalValue = Math.max(1, Number(raw.intervalValue ?? 1) || 1)
  const intervalUnit = normalizeUnit(raw.intervalUnit)
  const amountMinor = normalizeAmountMinor(raw.amountMinor)
  const categoryId = String(raw.categoryId ?? '').trim()
  const startDate = normalizeSubscriptionDateInput(
    raw.startDate
    ?? raw.lastPaidAt
    ?? raw.nextDueAt
    ?? raw.createdAt
    ?? toSubscriptionDateInput(new Date()),
  ) || toSubscriptionDateInput(new Date())
  const chargeDay = normalizeChargeDay(raw.chargeDay, startDate)
  const paused = normalizePaused(raw.paused)
  const note = normalizeNote(raw.note)

  return {
    id: String(raw.id ?? createId('sub')).trim() || createId('sub'),
    name,
    intervalValue,
    intervalUnit,
    amountMinor,
    accountId,
    categoryId,
    createdAt: String(raw.createdAt ?? '').trim() || new Date().toISOString(),
    startDate,
    chargeDay,
    paused,
    note,
  }
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return []
  return rawItems
    .map((item) => normalizeItem(item))
    .filter(Boolean)
    .sort((left, right) => {
      if (left.paused !== right.paused) return left.paused ? 1 : -1
      const leftNext = resolveSubscriptionNextChargeDate(left) || '9999-12-31'
      const rightNext = resolveSubscriptionNextChargeDate(right) || '9999-12-31'
      return leftNext.localeCompare(rightNext)
    })
}

async function saveItems(ledgerId, items) {
  ensureLedgerId(ledgerId)
  const normalized = normalizeItems(items)
  await dependencies.setSetting(ledgerId, SUBSCRIPTION_TRACKER_KEY, normalized)
  return normalized
}

export async function getSubscriptionItems(ledgerId) {
  ensureLedgerId(ledgerId)
  const stored = await dependencies.getSetting(ledgerId, SUBSCRIPTION_TRACKER_KEY)
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
    dependencies.assertCanCreateSubscription(current.length)
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

export function describeSubscriptionInterval(item) {
  const intervalValue = Math.max(1, Number(item?.intervalValue ?? 1) || 1)
  const intervalUnit = normalizeUnit(item?.intervalUnit)
  if (intervalUnit === 'year') return `${intervalValue}年`
  if (intervalUnit === 'day') return `${intervalValue}日`
  const chargeDay = normalizeChargeDay(item?.chargeDay, item?.startDate)
  return `${intervalValue}月（${chargeDay}號）`
}

export function isSubscriptionDue(item, now = new Date()) {
  return isSubscriptionChargeDue(item, now)
}
