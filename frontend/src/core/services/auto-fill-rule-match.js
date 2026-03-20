function compactText(value) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

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

export function matchAutoFillKeywordExpression(compact, keyword) {
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
