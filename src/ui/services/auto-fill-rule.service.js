import { getSetting, setSetting } from '@/core/repositories/settings.repo'
import { createId } from '@/core/utils/id'

const AUTO_FILL_RULES_KEY = 'ai_bookkeeping.auto_fill_rules'

function normalizeMajor(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.round(parsed * 100) / 100
}

function normalizeAddonItems(rawItems) {
  if (!Array.isArray(rawItems)) return []
  return rawItems
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const label = String(item.label ?? '').trim()
      const deltaMajor = normalizeMajor(item.deltaMajor ?? item.amountMajor)
      if (!label || !deltaMajor) return null
      return {
        label,
        deltaMajor,
      }
    })
    .filter(Boolean)
}

function ensureLedgerId(ledgerId) {
  if (!ledgerId) {
    throw new Error('缺少帳本 ID')
  }
}

function normalizeRule(raw) {
  if (!raw || typeof raw !== 'object') return null
  const keyword = String(raw.keyword ?? '').trim()
  if (!keyword) return null

  const type = ['income', 'expense', 'transfer'].includes(String(raw.type ?? '').trim())
    ? String(raw.type).trim()
    : 'expense'

  const accountId = String(raw.accountId ?? '').trim()
  const peerAccountId = String(raw.peerAccountId ?? '').trim()
  const categoryId = String(raw.categoryId ?? '').trim()
  const note = String(raw.note ?? '').trim()
  const amountMajor = normalizeMajor(raw.amountMajor)
  const isReimbursable = type === 'expense' ? Boolean(raw.isReimbursable) : false
  const addonItems = normalizeAddonItems(raw.addonItems)

  return {
    id: String(raw.id ?? createId('afr')).trim() || createId('afr'),
    keyword,
    type,
    accountId,
    categoryId: type === 'transfer' ? '' : categoryId,
    note,
    amountMajor,
    isReimbursable,
    addonItems,
    peerAccountId: type === 'transfer' ? peerAccountId : '',
  }
}

function normalizeRules(rawRules) {
  if (!Array.isArray(rawRules)) return []
  return rawRules
    .map((item) => normalizeRule(item))
    .filter(Boolean)
}

export async function getAutoFillRules(ledgerId) {
  ensureLedgerId(ledgerId)
  const stored = await getSetting(ledgerId, AUTO_FILL_RULES_KEY)
  return normalizeRules(stored)
}

export async function saveAutoFillRules(ledgerId, rules = []) {
  ensureLedgerId(ledgerId)
  const normalized = normalizeRules(rules)
  await setSetting(ledgerId, AUTO_FILL_RULES_KEY, normalized)
  return normalized
}

export async function upsertAutoFillRule(ledgerId, rule) {
  ensureLedgerId(ledgerId)
  const normalizedRule = normalizeRule(rule)
  if (!normalizedRule) {
    throw new Error('規則內容不完整')
  }

  const current = await getAutoFillRules(ledgerId)
  const next = current.filter((item) => item.id !== normalizedRule.id)
  next.push(normalizedRule)
  next.sort((a, b) => b.keyword.length - a.keyword.length)
  return saveAutoFillRules(ledgerId, next)
}

export async function removeAutoFillRule(ledgerId, ruleId) {
  ensureLedgerId(ledgerId)
  const normalizedId = String(ruleId ?? '').trim()
  if (!normalizedId) {
    return getAutoFillRules(ledgerId)
  }

  const current = await getAutoFillRules(ledgerId)
  const next = current.filter((item) => item.id !== normalizedId)
  return saveAutoFillRules(ledgerId, next)
}
