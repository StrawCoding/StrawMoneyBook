import {
  compactText,
  normalizeText,
  round2,
} from './ai-bookkeeping-text.js'
import { stripAddonSummaryFromStoredNote } from './ai-bookkeeping-note.js'

export function normalizeAutoFillRule(raw) {
  if (!raw || typeof raw !== 'object') return null
  const keyword = String(raw.keyword ?? '').trim()
  if (!keyword) return null
  const type = ['income', 'expense', 'transfer'].includes(String(raw.type ?? '').trim())
    ? String(raw.type).trim()
    : 'expense'
  const amountMajor = round2(Number(raw.amountMajor ?? 0))
  const addonItems = Array.isArray(raw.addonItems)
    ? raw.addonItems
      .map((item) => {
        const label = String(item?.label ?? '').trim()
        const deltaMajor = round2(Math.abs(Number(item?.deltaMajor ?? item?.amountMajor ?? 0)))
        if (!label || deltaMajor <= 0) return null
        return { label, deltaMajor }
      })
      .filter(Boolean)
    : []
  return {
    keyword,
    type,
    accountId: String(raw.accountId ?? '').trim(),
    categoryId: String(raw.categoryId ?? '').trim(),
    note: String(raw.note ?? '').trim(),
    amountMajor: amountMajor > 0 ? amountMajor : 0,
    isReimbursable: type === 'expense' ? Boolean(raw.isReimbursable) : false,
    addonItems,
    peerAccountId: String(raw.peerAccountId ?? '').trim(),
  }
}

function splitKeywordTokens(segment, pattern) {
  return String(segment ?? '')
    .split(pattern)
    .map((item) => compactText(item))
    .filter(Boolean)
}

function compileAutoFillKeywordExpression(keyword) {
  const source = String(keyword ?? '').trim()
  if (!source) return []

  const orPattern = /\s*(?:\bor\b|\|\||\||或者|或)\s*/i
  const andPattern = /\s*(?:\band\b|&&|&|且|並且|并且|和|與)\s*/i
  const groups = source
    .split(orPattern)
    .map((segment) => splitKeywordTokens(segment, andPattern))
    .filter((tokens) => tokens.length)

  if (groups.length) return groups
  const fallbackTokens = splitKeywordTokens(source, andPattern)
  return fallbackTokens.length ? [fallbackTokens] : []
}

function matchAutoFillKeywordExpression(compact, keyword) {
  const groups = compileAutoFillKeywordExpression(keyword)
  if (!groups.length) return null

  let best = null
  for (const tokens of groups) {
    let minIndex = Number.POSITIVE_INFINITY
    let score = 0
    let matched = true

    for (const token of tokens) {
      const index = compact.indexOf(token)
      if (index < 0) {
        matched = false
        break
      }
      minIndex = Math.min(minIndex, index)
      score += token.length
    }

    if (!matched) continue
    const candidate = {
      index: Number.isFinite(minIndex) ? minIndex : 0,
      score,
    }
    if (
      !best
      || candidate.index < best.index
      || (candidate.index === best.index && candidate.score > best.score)
    ) {
      best = candidate
    }
  }

  return best
}

export function pickMatchedAutoFillRule(text, rules) {
  const compact = compactText(text)
  if (!compact) return null

  let best = null
  for (const rawRule of rules ?? []) {
    const rule = normalizeAutoFillRule(rawRule)
    if (!rule) continue
    const matched = matchAutoFillKeywordExpression(compact, rule.keyword)
    if (!matched) continue

    const candidate = {
      ...rule,
      index: matched.index,
      score: matched.score,
    }

    if (
      !best
      || candidate.index < best.index
      || (candidate.index === best.index && candidate.score > best.score)
    ) {
      best = candidate
    }
  }

  return best
}

function tokenizeCategoryLearningText(value) {
  const source = normalizeText(value).toLowerCase()
  if (!source) return []

  const rawSegments = source.match(/[a-z0-9]+|[\u4e00-\u9fff]+/gi) ?? []
  const tokens = []

  for (const segment of rawSegments) {
    const token = String(segment ?? '').trim()
    if (!token) continue

    const isLatinNumeric = /^[a-z0-9]+$/.test(token)
    if (isLatinNumeric) {
      if (token.length >= 2 && !/^\d+$/.test(token)) {
        tokens.push(token)
      }
      continue
    }

    if (token.length <= 6) {
      tokens.push(token)
    }
    if (token.length >= 2) {
      for (let i = 0; i <= token.length - 2; i += 1) {
        tokens.push(token.slice(i, i + 2))
      }
    }
  }

  return tokens
}

function normalizeHistoryTransactionItem(item) {
  if (!item || typeof item !== 'object') return null
  const type = String(item?.type ?? '').trim()
  const categoryId = String(item?.categoryId ?? item?.category_id ?? '').trim()
  const note = normalizeText(item?.note ?? '')
  const occurredAt = String(item?.occurredAt ?? item?.occurred_at ?? '').trim()
  if (!type || !categoryId || !note) return null
  return { type, categoryId, note, occurredAt }
}

function normalizeHistoryCategoryAccountItem(item) {
  if (!item || typeof item !== 'object') return null
  const type = String(item?.type ?? '').trim()
  const categoryId = String(item?.categoryId ?? item?.category_id ?? '').trim()
  const accountId = String(item?.accountId ?? item?.account_id ?? '').trim()
  const occurredAt = String(item?.occurredAt ?? item?.occurred_at ?? '').trim()
  if (!type || !categoryId || !accountId) return null
  return { type, categoryId, accountId, occurredAt }
}

function normalizeHistoryAutoFillItem(item) {
  if (!item || typeof item !== 'object') return null
  const type = String(item?.type ?? '').trim()
  const accountId = String(item?.accountId ?? item?.account_id ?? '').trim()
  const peerAccountId = String(item?.peerAccountId ?? item?.peer_account_id ?? '').trim()
  const categoryId = String(item?.categoryId ?? item?.category_id ?? '').trim()
  const note = normalizeText(stripAddonSummaryFromStoredNote(item?.note ?? ''))
  const occurredAt = String(item?.occurredAt ?? item?.occurred_at ?? '').trim()
  if (!type) return null

  return {
    type,
    accountId,
    peerAccountId,
    categoryId,
    note,
    occurredAt,
  }
}

export function pickRecentAccountByCategory(historyTransactions, accounts, targetType, categoryId) {
  const normalizedType = String(targetType ?? '').trim()
  const normalizedCategoryId = String(categoryId ?? '').trim()
  if (!normalizedType || !normalizedCategoryId) return ''

  const activeAccountIdSet = new Set(
    (accounts ?? []).map((item) => String(item?.id ?? '').trim()).filter(Boolean),
  )
  if (!activeAccountIdSet.size) return ''

  const history = (historyTransactions ?? [])
    .map((item) => normalizeHistoryCategoryAccountItem(item))
    .filter(Boolean)
    .slice(0, 240)

  for (const tx of history) {
    if (tx.type !== normalizedType || tx.categoryId !== normalizedCategoryId) continue
    if (!activeAccountIdSet.has(tx.accountId)) continue
    return tx.accountId
  }

  return ''
}

export function pickRecentHistoryAutoFill(text, historyTransactions, now = new Date()) {
  const inputNote = normalizeText(stripAddonSummaryFromStoredNote(text))
  if (!inputNote) return null

  const inputCompact = compactText(inputNote)
  const inputTokens = [...new Set(tokenizeCategoryLearningText(inputNote))]
  const history = (historyTransactions ?? [])
    .map((item) => normalizeHistoryAutoFillItem(item))
    .filter(Boolean)
    .slice(0, 60)

  let best = null
  for (const tx of history) {
    if (!tx.note) continue
    const noteCompact = compactText(tx.note)
    const noteTokens = new Set(tokenizeCategoryLearningText(tx.note))
    let score = 0

    if (inputCompact && noteCompact) {
      if (inputCompact === noteCompact) {
        score += 260
      } else if (noteCompact.includes(inputCompact) || inputCompact.includes(noteCompact)) {
        score += 190
      }
    }

    if (inputTokens.length && noteTokens.size) {
      let overlap = 0
      for (const token of inputTokens) {
        if (noteTokens.has(token)) overlap += 1
      }
      score += overlap * 42
    }

    score += Math.round(resolveHistoryRecencyWeight(tx.occurredAt, now) * 35)
    if (score < 80) continue

    if (!best || score > best.score) {
      best = { ...tx, score }
    }
  }

  return best
}

function resolveHistoryRecencyWeight(occurredAt, now = new Date()) {
  const parsed = new Date(occurredAt)
  if (Number.isNaN(parsed.getTime())) return 0.7
  const days = Math.max(0, (now.getTime() - parsed.getTime()) / 86400000)
  return Math.max(0.35, Math.exp(-days / 240))
}

function tokenLearningWeight(token) {
  const text = String(token ?? '')
  if (!text) return 0
  if (/^[a-z0-9]+$/.test(text)) {
    return text.length >= 5 ? 1.15 : 0.95
  }
  if (text.length >= 3) return 1.2
  return 1
}

export function pickCategoryByHistoryLearning(text, categories, historyTransactions, targetType, now = new Date()) {
  const categoryIdSet = new Set((categories ?? []).map((item) => String(item?.id ?? '').trim()).filter(Boolean))
  if (!categoryIdSet.size) return null

  const history = (historyTransactions ?? [])
    .map((item) => normalizeHistoryTransactionItem(item))
    .filter(Boolean)
    .slice(0, 240)
  if (!history.length) return null

  const categoryTokenWeights = new Map()
  const categorySampleWeight = new Map()
  const tokenCategoryFrequency = new Map()

  for (const tx of history) {
    if (tx.type !== targetType) continue
    if (!categoryIdSet.has(tx.categoryId)) continue
    const tokenSet = new Set(tokenizeCategoryLearningText(tx.note))
    if (!tokenSet.size) continue

    const recencyWeight = resolveHistoryRecencyWeight(tx.occurredAt, now)
    categorySampleWeight.set(
      tx.categoryId,
      (categorySampleWeight.get(tx.categoryId) ?? 0) + recencyWeight,
    )

    let tokenWeights = categoryTokenWeights.get(tx.categoryId)
    if (!tokenWeights) {
      tokenWeights = new Map()
      categoryTokenWeights.set(tx.categoryId, tokenWeights)
    }

    for (const token of tokenSet) {
      const weight = recencyWeight * tokenLearningWeight(token)
      tokenWeights.set(token, (tokenWeights.get(token) ?? 0) + weight)
      tokenCategoryFrequency.set(token, (tokenCategoryFrequency.get(token) ?? 0) + 1)
    }
  }

  if (!categoryTokenWeights.size) return null
  const inputTokens = [...new Set(tokenizeCategoryLearningText(text))]
  if (!inputTokens.length) return null

  const categoryCount = categoryTokenWeights.size
  let best = null
  for (const category of categories ?? []) {
    const categoryId = String(category?.id ?? '').trim()
    if (!categoryId) continue
    const tokenWeights = categoryTokenWeights.get(categoryId)
    if (!tokenWeights) continue

    let overlap = 0
    let score = 0
    let categoryMagnitude = 0
    for (const value of tokenWeights.values()) {
      categoryMagnitude += Number(value) || 0
    }
    if (categoryMagnitude <= 0) continue

    for (const token of inputTokens) {
      const tokenWeight = Number(tokenWeights.get(token) ?? 0)
      if (!tokenWeight) continue
      overlap += 1
      const tokenDf = Number(tokenCategoryFrequency.get(token) ?? 0)
      const idf = Math.log((1 + categoryCount) / (1 + tokenDf)) + 1
      score += tokenWeight * idf
    }

    if (!overlap) continue
    const sampleWeight = Number(categorySampleWeight.get(categoryId) ?? 0)
    const normalizedScore = score / (Math.sqrt(categoryMagnitude) + 1)
    const confidenceBoost = Math.log1p(sampleWeight) * 0.08
    const finalScore = normalizedScore + confidenceBoost

    if (!best || finalScore > best.score) {
      best = { category, score: finalScore, overlap }
    }
  }

  if (!best) return null
  if (best.overlap < 1 || best.score < 0.22) return null
  return best.category
}
