import { extractTinyNerHints } from '@/core/services/ai-bookkeeping-tiny-ner.service'

export const AI_BOOKKEEPING_WARNING_KEY = Object.freeze({
  EMPTY_INPUT: 'ai_bookkeeping.warning.empty_input',
  INVALID_AMOUNT: 'ai_bookkeeping.warning.invalid_amount',
  TRANSFER_ACCOUNTS_INSUFFICIENT: 'ai_bookkeeping.warning.transfer_accounts_insufficient',
  NO_ACCOUNT: 'ai_bookkeeping.warning.no_account',
  NO_CATEGORY: 'ai_bookkeeping.warning.no_category',
  NO_COUNTERPARTY: 'ai_bookkeeping.warning.no_counterparty',
})

const AI_BOOKKEEPING_WARNING_FALLBACKS = Object.freeze({
  [AI_BOOKKEEPING_WARNING_KEY.EMPTY_INPUT]: '請輸入要解析的內容',
  [AI_BOOKKEEPING_WARNING_KEY.INVALID_AMOUNT]: '找不到有效金額，請手動輸入',
  [AI_BOOKKEEPING_WARNING_KEY.TRANSFER_ACCOUNTS_INSUFFICIENT]: '轉帳帳戶不足，請手動選擇轉出/轉入帳戶',
  [AI_BOOKKEEPING_WARNING_KEY.NO_ACCOUNT]: '找不到可用帳戶，請先建立帳戶',
  [AI_BOOKKEEPING_WARNING_KEY.NO_CATEGORY]: '沒有分類，請在設定中新增後再試',
  [AI_BOOKKEEPING_WARNING_KEY.NO_COUNTERPARTY]: '沒有辨識到借貸對象，請補上名字',
})

export function getAiBookkeepingWarningFallback(key) {
  const normalizedKey = String(key ?? '').trim()
  if (!normalizedKey) return ''
  return AI_BOOKKEEPING_WARNING_FALLBACKS[normalizedKey] ?? normalizedKey
}

function appendAiBookkeepingWarning(warnings, warningKeys, key) {
  const normalizedKey = String(key ?? '').trim()
  if (!normalizedKey) return
  if (warningKeys.includes(normalizedKey)) return
  warningKeys.push(normalizedKey)
  warnings.push(getAiBookkeepingWarningFallback(normalizedKey))
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/[，、。]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactText(value) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function normalizeBareTypeText(value) {
  return String(value ?? '')
    .replace(/[\s，、。,.!！?？:：;；'"`~\-_=+()（）[\]【】]/g, '')
    .toLowerCase()
}

const BARE_TYPE_INPUTS = Object.freeze({
  expense: new Set(['支出', 'expense']),
  income: new Set(['收入', 'income']),
  transfer: new Set(['轉帳', '转账', 'transfer']),
})

function isBareTypeOnlyInput(text, type) {
  const normalizedType = String(type ?? '').trim()
  const candidates = BARE_TYPE_INPUTS[normalizedType]
  if (!candidates) return false
  const normalizedText = normalizeBareTypeText(text)
  if (!normalizedText) return false
  return candidates.has(normalizedText)
}

function toMinor(major) {
  return Math.round(Number(major) * 100)
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

const ADDON_NOTE_PREFIX = '【附加項目】'

function stripAddonSummaryFromStoredNote(note) {
  return String(note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(ADDON_NOTE_PREFIX))
    .join('\n')
}

function parseAddonItemsFromStoredNote(note) {
  const summaryLine = String(note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith(ADDON_NOTE_PREFIX))
  if (!summaryLine) return []

  return summaryLine
    .slice(ADDON_NOTE_PREFIX.length)
    .trim()
    .split('、')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((segment) => {
      const matched = segment.match(/^(.+?)([+-])(\d+(?:\.\d+)?)$/)
      if (!matched) return null
      const [, label, , amountText] = matched
      const deltaMajor = round2(Math.abs(Number(amountText)))
      if (!label || deltaMajor <= 0) return null
      return {
        label: label.trim(),
        deltaMajor,
      }
    })
    .filter(Boolean)
}

function parseLooseNumber(rawValue) {
  const normalized = String(rawValue ?? '')
    .trim()
    .replace(/[,\s]/g, '')
  if (!normalized) return NaN
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : NaN
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => {
    const cloned = new RegExp(pattern.source, pattern.flags)
    return cloned.test(text)
  })
}

function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const ACCOUNT_NAME_GENERIC_TARGETS = new Set([
  '銀行',
  'bank',
  'account',
  'acct',
  'card',
  'wallet',
  '帳戶',
  '帐户',
  '帳號',
  '账号',
  '戶頭',
  '户头',
  '活存',
  '定存',
  '存款',
  '信用卡',
  '簽帳卡',
  '金融卡',
  '口座',
  'カード',
  'money',
])

function stripAccountNameSuffix(value) {
  let name = String(value ?? '').trim()
  if (!name) return ''
  const suffixPatterns = [
    /(銀行|bank)$/i,
    /(帳戶|帐户|帳號|账号|戶頭|户头)$/i,
    /(account|acct)$/i,
    /(活存|定存|存款)$/i,
    /(信用卡|簽帳卡|金融卡|card|wallet)$/i,
    /(口座|カード|ウォレット)$/i,
    /(台幣|臺幣|人民幣|美元|日圓|日元|歐元|日幣|円|yen|twd|cny|usd|jpy|eur)$/i,
  ]

  let changed = true
  while (changed) {
    changed = false
    for (const pattern of suffixPatterns) {
      const next = name.replace(pattern, '').trim()
      if (next && next !== name) {
        name = next
        changed = true
      }
    }
  }

  return name
}

function buildAccountMatchTargets(name) {
  const raw = String(name ?? '').trim()
  if (!raw) return []

  const targets = []
  const seen = new Set()
  const pushTarget = (value, bonus = 0) => {
    const target = compactText(value)
    if (target.length < 2) return
    if (/^\d+$/.test(target)) return
    if (ACCOUNT_NAME_GENERIC_TARGETS.has(target)) return
    if (seen.has(target)) return
    seen.add(target)
    targets.push({ target, bonus })
  }

  pushTarget(raw, 12)
  const strippedRaw = stripAccountNameSuffix(raw)
  if (strippedRaw && strippedRaw !== raw) {
    pushTarget(strippedRaw, 8)
  }

  const normalized = raw.replace(/[()（）[\]【】]/g, ' ')
  const parts = normalized
    .split(/[\s\-_/,.，。:：]+/)
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)

  for (const part of parts) {
    pushTarget(part, 4)
    const strippedPart = stripAccountNameSuffix(part)
    if (strippedPart && strippedPart !== part) {
      pushTarget(strippedPart, 2)
    }
  }

  return targets
}

function parseDateTimeFromText(text, now = new Date()) {
  const base = new Date(now)
  base.setSeconds(0, 0)

  if (/前天|おととい|day\s+before\s+yesterday/i.test(text)) {
    base.setDate(base.getDate() - 2)
  } else if (/昨天|昨日|yesterday/i.test(text)) {
    base.setDate(base.getDate() - 1)
  } else if (/明天|明日|tomorrow/i.test(text)) {
    base.setDate(base.getDate() + 1)
  }

  const ymd = text.match(/(\d{4})\s*(?:[./-]|年)\s*(\d{1,2})\s*(?:[./-]|月)\s*(\d{1,2})(?:日)?/)
  if (ymd) {
    const year = Number(ymd[1])
    const month = Number(ymd[2]) - 1
    const day = Number(ymd[3])
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      base.setFullYear(year, month, day)
    }
  } else {
    const md = text.match(/(\d{1,2})\s*(?:[./-]|月)\s*(\d{1,2})(?:日)?/)
    if (md) {
      const month = Number(md[1]) - 1
      const day = Number(md[2])
      if (Number.isFinite(month) && Number.isFinite(day)) {
        base.setMonth(month, day)
      }
    }
  }

  const hm = text.match(/([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)\s*(am|pm|a\.m\.|p\.m\.|午前|午後)?/i)
  if (hm) {
    let hour = Number(hm[1])
    const minute = Number(hm[2])
    const period = String(hm[3] ?? '').toLowerCase()
    if ((period === 'pm' || period === 'p.m.' || period === '午後') && hour < 12) {
      hour += 12
    }
    if ((period === 'am' || period === 'a.m.' || period === '午前') && hour === 12) {
      hour = 0
    }
    base.setHours(hour, minute, 0, 0)
    return base.toISOString()
  }

  const hourOnly = text.match(
    /(凌晨|早上|上午|中午|下午|晚上|午前|午後|morning|afternoon|evening|night)?\s*(\d{1,2})\s*(點|时|時|o'clock|oclock)?(?:\s*(\d{1,2})\s*(?:分|min|minutes?)?)?\s*(am|pm|a\.m\.|p\.m\.)?/i,
  )
  if (hourOnly) {
    const hasExplicitTimeMarker = Boolean(hourOnly[1] || hourOnly[3] || hourOnly[5])
    if (!hasExplicitTimeMarker) {
      return base.toISOString()
    }
    let hour = Number(hourOnly[2])
    const minute = Number(hourOnly[4] ?? 0)
    const period = `${String(hourOnly[1] ?? '')} ${String(hourOnly[5] ?? '')}`.toLowerCase()
    if (/(下午|晚上|午後|afternoon|evening|night|pm|p\.m\.)/.test(period) && hour < 12) {
      hour += 12
    }
    if (/中午/.test(period) && hour < 11) {
      hour += 12
    }
    if (/(凌晨|午前|morning|am|a\.m\.)/.test(period) && hour === 12) {
      hour = 0
    }
    if (Number.isFinite(hour) && Number.isFinite(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      base.setHours(hour, minute, 0, 0)
    }
  }

  return base.toISOString()
}

function parseAmountMajor(text) {
  const withUnit = [
    ...text.matchAll(
      /([+-]?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)\s*(萬|w|千|k|百|元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\$|\$|¥|￥)/gi,
    ),
  ]
  if (withUnit.length > 0) {
    const target = withUnit[withUnit.length - 1]
    const raw = parseLooseNumber(target[1])
    const unit = String(target[2] ?? '').toLowerCase()
    if (Number.isFinite(raw)) {
      if (unit === '萬' || unit === 'w') return Math.abs(round2(raw * 10000))
      if (unit === '千' || unit === 'k') return Math.abs(round2(raw * 1000))
      if (unit === '百') return Math.abs(round2(raw * 100))
      return Math.abs(round2(raw))
    }
  }

  const allNumbers = [...text.matchAll(/([+-]?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)/g)]
    .map((item) => parseLooseNumber(item[1]))
    .filter((item) => Number.isFinite(item) && Math.abs(item) > 0)
    .map((item) => Math.abs(item))

  if (!allNumbers.length) return NaN

  const year = text.match(/(\d{4})\s*(?:[./-]|年)\s*(\d{1,2})\s*(?:[./-]|月)\s*(\d{1,2})(?:日)?/)?.[1]
  const yearNum = Number(year)
  const candidates = allNumbers.filter((value) => {
    if (Number.isFinite(yearNum) && value === yearNum) return false
    return value >= 0.01 && value <= 9999999
  })

  if (!candidates.length) return NaN

  const sorted = [...candidates].sort((a, b) => b - a)
  const candidate = sorted.find((value) => value >= 1 && value <= 999999) ?? sorted[0]
  return round2(candidate)
}

function parseAmountWithUnit(rawAmount, rawUnit = '') {
  const amount = Math.abs(parseLooseNumber(rawAmount))
  if (!Number.isFinite(amount) || amount <= 0) return NaN
  const unit = String(rawUnit ?? '').toLowerCase()
  if (unit === '萬' || unit === 'w') return round2(amount * 10000)
  if (unit === '千' || unit === 'k') return round2(amount * 1000)
  if (unit === '百') return round2(amount * 100)
  return round2(amount)
}

function stripTextByRanges(text, ranges) {
  if (!ranges.length) return text
  let result = ''
  let cursor = 0
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  for (const range of sorted) {
    if (range.start > cursor) {
      result += text.slice(cursor, range.start)
    }
    cursor = Math.max(cursor, range.end)
  }
  if (cursor < text.length) {
    result += text.slice(cursor)
  }
  return normalizeText(result)
}

function extractAddonItems(text) {
  const items = []
  const ranges = []
  const addonPatterns = [
    {
      defaultDirection: 'plus',
      regex: /(附加項目|附加費|手續費|服務費|運費|稅金|稅費|匯費|利息|加價|加收|fee|fees|service fee|shipping|tax|surcharge|interest|手数料|配送料|送料|税金)\s*([+-]?)\s*((?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)\s*(萬|w|千|k|百|元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\$|\$|¥|￥)?/gi,
    },
    {
      defaultDirection: 'minus',
      regex: /(折扣|優惠|回饋|減免|折讓|discount|coupon|rebate|cashback|値引き|割引|クーポン|キャッシュバック)\s*([+-]?)\s*((?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)\s*(萬|w|千|k|百|元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\$|\$|¥|￥)?/gi,
    },
  ]

  for (const pattern of addonPatterns) {
    let matched = pattern.regex.exec(text)
    while (matched) {
      const keyword = String(matched[1] ?? '').trim() || '附加項目'
      const amountMajor = parseAmountWithUnit(matched[3], matched[4])
      if (Number.isFinite(amountMajor) && amountMajor > 0) {
        items.push({
          label: keyword,
          // Direction is determined by addon template/default semantic, not by text sign.
          direction: pattern.defaultDirection,
          deltaMajor: amountMajor,
        })
        ranges.push({
          start: matched.index,
          end: matched.index + String(matched[0] ?? '').length,
        })
      }
      matched = pattern.regex.exec(text)
    }
  }

  return {
    items,
    strippedText: stripTextByRanges(text, ranges),
  }
}

function findAccountMatchEntries(text, accounts) {
  const compact = compactText(text)
  const matches = []
  const duplicateNameCount = new Map()

  for (const account of accounts ?? []) {
    const nameKey = compactText(String(account?.name ?? '').trim())
    if (!nameKey) continue
    duplicateNameCount.set(nameKey, (duplicateNameCount.get(nameKey) ?? 0) + 1)
  }

  for (const account of accounts ?? []) {
    const name = String(account?.name ?? '').trim()
    if (!name) continue
    const groupName = String(account?.groupName ?? account?.group_name ?? '').trim()
    const compactName = compactText(name)
    const compactGroupName = compactText(groupName)
    const hasDuplicateName = (duplicateNameCount.get(compactName) ?? 0) > 1
    const targets = buildAccountMatchTargets(name)
    for (const { target, bonus } of targets) {
      const index = compact.indexOf(target)
      if (index < 0) continue
      let score = target.length + bonus

      if (hasDuplicateName && compactGroupName) {
        const groupIndex = compact.indexOf(compactGroupName)
        if (groupIndex >= 0) {
          score += 500
          if (
            compact.includes(`${compactGroupName}${target}`)
            || compact.includes(`${target}${compactGroupName}`)
          ) {
            score += 300
          }
        }
      }

      matches.push({ account, index, score, target })
    }
  }

  matches.sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index
    return b.score - a.score
  })

  const deduped = []
  const seen = new Set()
  for (const item of matches) {
    const accountId = String(item?.account?.id ?? '').trim()
    const uniqueKey = accountId || `${item.target}:${item.index}`
    if (seen.has(uniqueKey)) continue
    seen.add(uniqueKey)
    deduped.push(item)
  }
  return deduped
}

function findAccountMatches(text, accounts) {
  return findAccountMatchEntries(text, accounts).map((item) => item.account)
}

function countSubsequenceHits(source, target) {
  if (!source || !target) return 0
  let sourceIndex = 0
  let hits = 0
  for (let i = 0; i < target.length; i += 1) {
    const char = target[i]
    const foundAt = source.indexOf(char, sourceIndex)
    if (foundAt < 0) continue
    hits += 1
    sourceIndex = foundAt + 1
  }
  return hits
}

function fuzzyAccountScore(textCompact, accountNameCompact) {
  if (!textCompact || !accountNameCompact) return 0
  if (textCompact.includes(accountNameCompact)) return 1000 + accountNameCompact.length
  if (accountNameCompact.includes(textCompact) && textCompact.length >= 2) return 700 + textCompact.length

  let overlap = 0
  for (const char of accountNameCompact) {
    if (textCompact.includes(char)) overlap += 1
  }
  const subseq = countSubsequenceHits(textCompact, accountNameCompact)
  const coverage = overlap / Math.max(accountNameCompact.length, 1)
  const subseqCoverage = subseq / Math.max(accountNameCompact.length, 1)
  return coverage * 100 + subseqCoverage * 120
}

function pickClosestAccount(text, accounts) {
  const compact = compactText(text)
  if (!compact) return null

  const strict = findAccountMatches(text, accounts)
  if (strict.length > 0) return strict[0]

  const duplicateNameCount = new Map()
  for (const account of accounts ?? []) {
    const nameKey = compactText(String(account?.name ?? '').trim())
    if (!nameKey) continue
    duplicateNameCount.set(nameKey, (duplicateNameCount.get(nameKey) ?? 0) + 1)
  }

  let best = null
  for (const account of accounts ?? []) {
    const name = String(account?.name ?? '').trim()
    if (!name) continue
    const groupName = String(account?.groupName ?? account?.group_name ?? '').trim()
    const compactName = compactText(name)
    const compactGroupName = compactText(groupName)
    let score = fuzzyAccountScore(compact, compactName)

    if ((duplicateNameCount.get(compactName) ?? 0) > 1 && compactGroupName) {
      const comboScore = fuzzyAccountScore(compact, `${compactGroupName}${compactName}`)
      const reverseComboScore = fuzzyAccountScore(compact, `${compactName}${compactGroupName}`)
      score = Math.max(score, comboScore + 120, reverseComboScore + 120)
      if (compact.includes(compactGroupName)) {
        score += 220
      }
    }

    if (!best || score > best.score) {
      best = { account, score }
    }
  }

  if (!best || best.score < 90) return null
  return best.account
}

function findAccountByKeyword(text, accounts, keywords) {
  const source = String(text ?? '')
  const lowerSource = source.toLowerCase()
  for (const keyword of keywords) {
    const normalizedKeyword = String(keyword ?? '')
    if (!normalizedKeyword) continue
    const keywordIndex = lowerSource.indexOf(normalizedKeyword.toLowerCase())
    const textAfterKeyword = keywordIndex >= 0 ? source.slice(keywordIndex + normalizedKeyword.length) : ''

    for (const account of accounts ?? []) {
      const name = String(account?.name ?? '').trim()
      if (!name) continue
      const keywordPattern = new RegExp(`${escapeRegExp(normalizedKeyword)}\\s*${escapeRegExp(name)}`, 'i')
      if (keywordPattern.test(source)) return account
    }

    const fuzzy = pickClosestAccount(textAfterKeyword, accounts)
    if (fuzzy) return fuzzy
  }
  return null
}

function pickTransferAccounts(text, accounts) {
  const matched = findAccountMatches(text, accounts)

  const fromByKeyword = findAccountByKeyword(
    text,
    accounts,
    ['從', '由', '自', '用', '刷', '扣', '轉出', '匯出', '拨出', '撥出', 'from', 'via', 'using', 'out of', 'から', 'より'],
  )
  const toByKeyword = findAccountByKeyword(
    text,
    accounts,
    ['到', '至', '給', '轉入', '匯入', '存入', '打到', '撥入', '拨入', 'to', 'into', 'deposit to', 'pay to', 'へ'],
  )

  let from = fromByKeyword ?? matched[0] ?? null
  let to = toByKeyword ?? matched.find((item) => item.id !== from?.id) ?? null

  if (from && to && from.id === to.id) {
    to = matched.find((item) => item.id !== from.id) ?? null
  }

  return {
    fromAccountId: from?.id ?? '',
    toAccountId: to?.id ?? '',
  }
}

function pickCategoryMatch(text, categories) {
  const compact = compactText(text)
  let best = null

  for (const category of categories ?? []) {
    const name = String(category?.name ?? '').trim()
    if (!name) continue
    const target = compactText(name)
    const index = compact.indexOf(target)
    if (index < 0) continue

    const candidate = {
      category,
      index,
      score: target.length,
    }

    if (!best) {
      best = candidate
      continue
    }

    if (candidate.index < best.index || (candidate.index === best.index && candidate.score > best.score)) {
      best = candidate
    }
  }

  return best?.category ?? null
}

function normalizeAutoFillRule(raw) {
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

function pickMatchedAutoFillRule(text, rules) {
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

function pickRecentAccountByCategory(historyTransactions, accounts, targetType, categoryId) {
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

function pickRecentHistoryAutoFill(text, historyTransactions, now = new Date()) {
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

function pickCategoryByHistoryLearning(text, categories, historyTransactions, targetType, now = new Date()) {
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

const MEAL_CATEGORY_PRIORITIES = [
  { key: '早餐', triggers: [/早餐|早午餐|brunch|breakfast/i], aliases: ['早餐', '早午餐', 'brunch', 'breakfast'] },
  { key: '午餐', triggers: [/午餐|中餐|便當|lunch/i], aliases: ['午餐', '中餐', '便當', 'lunch'] },
  { key: '晚餐', triggers: [/晚餐|晚飯|晚餐宵夜|dinner|supper/i], aliases: ['晚餐', '晚飯', '晚餐宵夜', 'dinner', 'supper'] },
  { key: '宵夜', triggers: [/宵夜|夜食|midnight snack|late night/i], aliases: ['宵夜', '夜食', 'midnight snack', 'late night'] },
]

function pickMealTimeCategory(text, categories) {
  const matchedMeal = MEAL_CATEGORY_PRIORITIES.find((meal) => includesAny(text, meal.triggers))
  if (!matchedMeal) return null

  let best = null
  for (const category of categories ?? []) {
    const name = String(category?.name ?? '').trim()
    if (!name) continue

    const normalizedName = name.toLowerCase()
    let score = 0
    if (normalizedName === matchedMeal.key) {
      score += 400
    }
    for (const alias of matchedMeal.aliases) {
      const normalizedAlias = String(alias).toLowerCase()
      if (!normalizedAlias) continue
      if (normalizedName === normalizedAlias) {
        score += 320
      } else if (normalizedName.includes(normalizedAlias)) {
        score += 200
      }
    }

    if (!score) continue
    if (!best || score > best.score) {
      best = { category, score }
    }
  }
  return best?.category ?? null
}

const EXPENSE_CATEGORY_SEMANTIC_RULES = [
  {
    triggers: [/早餐|午餐|晚餐|宵夜|便當|餐廳|咖啡|飲料|手搖|點心|foodpanda|ubereats|uber eats|breakfast|lunch|dinner|meal|restaurant|coffee|drink|snack|朝食|昼食|夕食|外食|喫茶/i],
    hints: ['早餐', '午餐', '晚餐', '餐飲', '飲食', '餐費', '便當', '餐', '食', '飲', '伙食', '咖啡', 'food', 'meal', '食費', '外食'],
  },
  {
    triggers: [/捷運|高鐵|台鐵|公車|計程車|uber|停車|加油|車票|交通|transport|transit|bus|train|taxi|parking|fuel|gas|commute|電車|地下鉄|タクシー|交通費/i],
    hints: ['交通', '運輸', '通勤', '停車', '油', 'transport', 'commute', '交通費'],
  },
  {
    triggers: [/房租|租金|管理費|水費|電費|瓦斯|網路費|電話費|電信|rent|utility|utilities|electric|water bill|gas bill|internet|phone bill|家賃|光熱費|通信費/i],
    hints: ['居家', '家用', '房租', '水電', '電信', '網路', '租', 'rent', 'utilities', 'home', '家賃', '光熱費'],
  },
  {
    triggers: [/看病|門診|藥|醫院|診所|牙醫|健保|醫療|clinic|hospital|doctor|medicine|medical|pharmacy|病院|診療|薬|医療/i],
    hints: ['醫療', '健康', '藥', '保健', 'medical', 'health', 'medicine', '医療', '薬'],
  },
  {
    triggers: [/電影|演唱會|旅遊|住宿|飯店|遊戲|娛樂|ktv|netflix|spotify|movie|travel|hotel|game|entertainment|concert|trip|映画|旅行|宿泊|娯楽|ゲーム/i],
    hints: ['娛樂', '休閒', '旅遊', '玩樂', 'entertainment', 'travel', 'leisure', '娯楽', '旅行'],
  },
  {
    triggers: [/課程|學費|書|教材|補習|訓練|證照|course|tuition|book|training|lesson|education|授業|学費|教材|勉強|講座/i],
    hints: ['學習', '教育', '進修', '書', 'education', 'learning', 'tuition', '教育', '学習'],
  },
  {
    triggers: [/衣服|褲子|鞋|包包|服飾|化妝品|保養品|clothes|shoes|bag|fashion|cosmetic|skincare|apparel|衣類|靴|バッグ|化粧品/i],
    hints: ['服飾', '穿搭', '美妝', '購物', 'fashion', 'apparel', 'shopping', '服飾', '美容'],
  },
]

const INCOME_CATEGORY_SEMANTIC_RULES = [
  { triggers: [/薪水|薪資|月薪|年終|獎金|津貼|加班費|salary|paycheck|wage|bonus|income|給料|給与|賞与/i], hints: ['薪', '薪資', '薪水', '工作', '收入', 'salary', 'income', '給与', '給料'] },
  { triggers: [/利息|股息|配息|投資|分紅|回饋金|interest|dividend|investment|yield|return|利息|配当|投資/i], hints: ['投資', '利息', '股', '配息', '被動', 'investment', 'interest', 'dividend', '配当'] },
  { triggers: [/退款|退費|退稅|退貨|refund|rebate|cashback|tax refund|返金|払い戻し/i], hints: ['退款', '退費', '退稅', '其他收入', 'refund', 'rebate', 'cashback', '返金'] },
  { triggers: [/接案|佣金|手續費收入|兼職|外快|freelance|commission|side job|side income|contract|副業|報酬|手数料収入/i], hints: ['接案', '兼職', '副業', '佣金', '收入', 'freelance', 'commission', 'side income', '副業', '報酬'] },
]

function includesKeyword(text, keywords) {
  const source = String(text ?? '').toLowerCase()
  return keywords.some((keyword) => source.includes(String(keyword).toLowerCase()))
}

function isGenericCategoryName(name) {
  const text = String(name ?? '').trim().toLowerCase()
  if (!text) return false
  return /^(其他|雜項|未分類|misc|other)$/.test(text)
}

function pickCategoryBySemanticRules(text, categories, rules) {
  let best = null
  for (const category of categories ?? []) {
    const name = String(category?.name ?? '').trim()
    if (!name) continue

    let score = 0
    for (const rule of rules) {
      if (!includesAny(text, rule.triggers)) continue
      if (includesKeyword(name, rule.hints)) {
        score += 100
      }
    }
    if (isGenericCategoryName(name)) {
      score -= 40
    }
    if (!score) continue

    if (!best || score > best.score) {
      best = { category, score }
    }
  }
  return best?.category ?? null
}

const CASHBACK_CATEGORY_NAME_PATTERNS = [
  /回饋|回馈|回饋金|現金回饋|现金回馈/,
  /\brebate\b/i,
  /\bcash\s*back\b/i,
  /\bcashback\b/i,
  /\breward\b/i,
  /キャッシュバック|ポイント還元|還元/,
]
const CASHBACK_MENTION_PATTERN = /回饋|回馈|回饋金|現金回饋|现金回馈|rebate|cash\s*back|cashback|reward|キャッシュバック|ポイント還元|還元/gi

function matchesAnyPattern(text, patterns) {
  const source = String(text ?? '').trim()
  if (!source) return false
  return patterns.some((pattern) => {
    const cloned = new RegExp(pattern.source, pattern.flags)
    return cloned.test(source)
  })
}

function isCashbackLikeCategoryName(name) {
  return matchesAnyPattern(name, CASHBACK_CATEGORY_NAME_PATTERNS)
}

function countPatternMatches(text, pattern) {
  const source = String(text ?? '')
  if (!source) return 0

  const cloned = new RegExp(pattern.source, pattern.flags)
  let count = 0
  let matched = cloned.exec(source)
  while (matched) {
    count += 1
    if (matched[0] === '') {
      cloned.lastIndex += 1
    }
    matched = cloned.exec(source)
  }
  return count
}

function pickCashbackIncomeCategory(text, categories) {
  if (!isCashbackLikeCategoryName(text)) return null

  let best = null
  for (const category of categories ?? []) {
    const name = String(category?.name ?? '').trim()
    if (!isCashbackLikeCategoryName(name)) continue

    let score = 100
    const compactName = compactText(name)
    const compactSource = compactText(text)
    if (compactName && compactSource && compactSource.includes(compactName)) {
      score += 180
    } else if (compactName && compactName.includes('回饋')) {
      score += 40
    }

    if (!best || score > best.score) {
      best = { category, score }
    }
  }

  return best?.category ?? null
}

function consumeCategoryCashbackAddon(addonItems, selectedCategoryName, sourceText) {
  const source = Array.isArray(addonItems) ? addonItems : []
  if (!source.length) return source
  if (!isCashbackLikeCategoryName(selectedCategoryName)) return source

  const cashbackAddonIndexes = source
    .map((item, index) => (isCashbackLikeCategoryName(item?.label) ? index : -1))
    .filter((index) => index >= 0)
  if (!cashbackAddonIndexes.length) return source

  const cashbackMentionCount = countPatternMatches(sourceText, CASHBACK_MENTION_PATTERN)
  if (cashbackMentionCount > cashbackAddonIndexes.length) {
    return source
  }

  const firstCashbackIndex = cashbackAddonIndexes[0]
  if (firstCashbackIndex < 0) return source

  return source.filter((_, index) => index !== firstCashbackIndex)
}

function mergeUniqueAddonItems(baseItems, extraItems) {
  const merged = []
  const keys = new Set()

  const pushItem = (item) => {
    const label = String(item?.label ?? '').trim()
    const deltaMajor = round2(Math.abs(Number(item?.deltaMajor ?? item?.amountMajor ?? 0)))
    if (!label || deltaMajor <= 0) return
    const key = `${compactText(label)}:${deltaMajor}`
    if (keys.has(key)) return
    keys.add(key)
    merged.push({
      label,
      deltaMajor,
    })
  }

  for (const item of baseItems ?? []) pushItem(item)
  for (const item of extraItems ?? []) pushItem(item)
  return merged
}

function extractSmartNoteText(text, context = {}) {
  let note = String(text ?? '')
  const accountNames = (context.accounts ?? [])
    .map((item) => String(item?.name ?? '').trim())
    .filter(Boolean)
  const duplicateAccountGroupNames = collectDuplicateAccountGroupNames(context.accounts)
  const selectedCategoryName = String(context.selectedCategoryName ?? '').trim()
  const categoryNames = (context.categories ?? [])
    .map((item) => String(item?.name ?? '').trim())
    .filter(Boolean)

  if (selectedCategoryName) {
    note = note.replace(new RegExp(escapeRegExp(selectedCategoryName), 'gi'), ' ')
  }
  for (const categoryName of categoryNames) {
    if (!categoryName || categoryName === selectedCategoryName) continue
    note = note.replace(new RegExp(escapeRegExp(categoryName), 'gi'), ' ')
  }

  for (const accountName of accountNames) {
    note = note.replace(new RegExp(escapeRegExp(accountName), 'gi'), ' ')
  }
  for (const groupName of duplicateAccountGroupNames) {
    note = note.replace(new RegExp(escapeRegExp(groupName), 'gi'), ' ')
  }

  const stripPatterns = [
    /\d{4}\s*(?:[./-]|年)\s*\d{1,2}\s*(?:[./-]|月)\s*\d{1,2}(?:日)?/g,
    /\d{1,2}\s*(?:[./-]|月)\s*\d{1,2}(?:日)?/g,
    /([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)\s*(am|pm|a\.m\.|p\.m\.|午前|午後)?/gi,
    /(凌晨|早上|上午|中午|下午|晚上|午前|午後|morning|afternoon|evening|night)?\s*\d{1,2}\s*(點|时|時|o'clock|oclock)?(?:\s*\d{1,2}\s*(分|min|minutes?)?)?\s*(am|pm|a\.m\.|p\.m\.)?/gi,
    /[+-]?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?\s*(萬|w|千|k|百|元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\$|\$|¥|￥)/gi,
    /[+-]?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?/g,
    /(昨天|今天|明天|前天|剛剛|剛才|方才|剛|昨日|今日|明日|おととい|yesterday|today|tomorrow|just now)/gi,
    /(刷卡|現金|轉帳|转账|轉出|转出|轉入|转入|轉給|转给|轉到|转到|匯款|汇款|匯入|汇入|匯出|汇出|打款|打錢|打钱|撥款|拨款|調撥|调拨|挪款|挪錢|挪钱|搬錢|搬钱|移轉|互轉|過戶|过户|付款|支付|扣款|入帳|報[銷修]|報帳|請款|紀錄|記帳|新增|幫我|請幫我|pay|paid|payment|spent|spend|expense|income|transfer|from|to|deposit|withdraw|record|log|create|add|reimburse|reimbursable|返済|入金|出金|振込|送金|記録|追加|精算)/gi,
    /(收入|支出|轉出|转出|轉入|转入|匯出|汇出|匯入|汇入|income|expense|transfer|収入|支出|振替)/gi,
    /(計入預算|不計入預算|計入收支|不計入收支|算進預算|算進分析|include in budget|exclude from budget|include in analysis|exclude from analysis|予算に含める|予算に含めない|分析に含める|分析に含めない)/gi,
    /(早餐|午餐|晚餐|宵夜|餐費|餐飲|伙食|飲料|咖啡|交通|車資|通勤|捷運|地鐵|公車|客運|高鐵|台鐵|火車|計程車|uber|油錢|停車費|房租|租金|水費|電費|瓦斯|網路費|電信費|醫療|藥費|娛樂|旅遊|學費|教材|服飾|美妝|薪水|薪資|獎金|利息|股息|退款|退費|breakfast|lunch|dinner|meal|food|drink|transport|rent|utility|medical|travel|education|salary|bonus|interest|refund|朝食|昼食|夕食|食費|交通費|家賃|光熱費|医療|旅行|学費|給与|返金)/gi,
    /(錢包|信用卡|簽帳卡|金融卡|帳戶|wallet|card|account|bank|口座|カード|財布)/gi,
  ]

  for (const pattern of stripPatterns) {
    note = note.replace(pattern, ' ')
  }

  note = note
    .replace(/[，。；、]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (note.length > 36) {
    note = note.slice(0, 36).trim()
  }
  return note
}

function collectDuplicateAccountGroupNames(accounts) {
  const duplicateNameCount = new Map()
  const result = new Set()

  for (const account of accounts ?? []) {
    const nameKey = compactText(String(account?.name ?? '').trim())
    if (!nameKey) continue
    duplicateNameCount.set(nameKey, (duplicateNameCount.get(nameKey) ?? 0) + 1)
  }

  for (const account of accounts ?? []) {
    const nameKey = compactText(String(account?.name ?? '').trim())
    if (!nameKey || (duplicateNameCount.get(nameKey) ?? 0) <= 1) continue
    const groupName = String(account?.groupName ?? account?.group_name ?? '').trim()
    if (!groupName) continue
    result.add(groupName)
  }

  return Array.from(result)
}

function normalizeType(text) {
  if (
    includesAny(text, [
      /轉帳|转账/,
      /轉出|转出/,
      /轉給|转给/,
      /轉至|转至/,
      /轉到|转到/,
      /轉入|转入/,
      /轉錢|转钱/,
      /轉款|转款/,
      /匯款|汇款/,
      /匯出|汇出/,
      /匯入|汇入/,
      /匯給|汇给/,
      /打款|打錢|打钱/,
      /撥款|拨款/,
      /撥轉|拨转|調撥|调拨/,
      /挪款|挪錢|挪钱/,
      /搬錢|搬钱|搬款/,
      /移轉|过户|過戶/,
      /內轉|内转|互轉|互转/,
      /帳戶互轉|账户互转/,
      /跨行轉帳|跨行转账/,
      /行內轉帳|行内转账/,
      /\btransfer\b/i,
      /\btransferred\b/i,
      /\bmove money\b/i,
      /\bwire\b/i,
      /振込|送金|振替|口座間/,
    ])
  ) {
    return 'transfer'
  }
  if (
    includesAny(text, [
      /收入/,
      /薪水/,
      /薪資/,
      /獎金/,
      /入帳/,
      /收到/,
      /退款/,
      /退費/,
      /回饋/,
      /\bincome\b/i,
      /\bsalary\b/i,
      /\bwage\b/i,
      /\bbonus\b/i,
      /\brefund\b/i,
      /\brebate\b/i,
      /収入|給料|給与|返金|入金/,
    ])
  ) {
    return 'income'
  }
  return 'expense'
}

const LOAN_INTENT_PATTERN_GROUPS = [
  {
    mode: 'repay',
    direction: 'lend',
    priority: 1,
    patterns: [/收回/, /收到.*還款/, /還我/, /还我/, /回收借款/, /paid me back/i, /pay me back/i, /returned.*loan/i, /貸した.*返して/, /返してくれた/],
  },
  {
    mode: 'repay',
    direction: 'borrow',
    priority: 2,
    patterns: [/歸還/, /归还/, /還給/, /还给/, /還錢/, /还钱/, /償還/, /偿还/, /(向|跟)\S{0,8}還款/, /還款給/, /\brepay\b/i, /\brepaid\b/i, /pay back/i, /returned to/i, /返済/, /返した/],
  },
  {
    mode: 'create',
    direction: 'lend',
    priority: 3,
    patterns: [/借給/, /借了給/, /借出給/, /借出/, /借款給/, /lend to/i, /loaned to/i, /I lent/i, /貸した/, /貸して/],
  },
  {
    mode: 'create',
    direction: 'borrow',
    priority: 4,
    patterns: [/借入/, /(向|跟)\S{0,8}借/, /借款/, /借錢/, /借钱/, /borrow from/i, /borrowed from/i, /loan from/i, /借りた/, /借入れ/],
  },
]

function firstPatternMatch(text, patterns) {
  const source = String(text ?? '')
  let best = null
  for (const pattern of patterns ?? []) {
    const cloned = new RegExp(pattern.source, pattern.flags)
    const matched = cloned.exec(source)
    if (!matched) continue
    if (!best || matched.index < best.index) {
      best = { index: matched.index, matched }
    }
  }
  return best
}

function normalizeCounterpartyName(rawName) {
  let name = String(rawName ?? '').trim()
  if (!name) return ''
  name = name.replace(/^(?:[給跟向對把將]+|to\s+|from\s+)/i, '')
  name = name.replace(/[的之]+$/g, '')
  name = name.replace(/(借款|欠款|還款|还款|款項|款项|款|錢|钱|loan|repay|payment|money)$/gi, '')
  name = name.replace(/^[,，。:：;；]+|[,，。:：;；]+$/g, '')
  name = name.trim()
  if (!name) return ''
  if (isLikelyAmountLikeCounterparty(name)) return ''
  if (name.length > 24) {
    name = name.slice(0, 24).trim()
  }
  if (!name) return ''
  if (includesAny(name, [/^(昨天|今天|明天|前天|剛剛|刚刚|下午|上午|晚上|早上|yesterday|today|tomorrow|afternoon|morning|evening|night|昨日|今日|明日)$/i])) return ''
  return name
}

function isLikelyAmountLikeCounterparty(rawValue) {
  const normalized = String(rawValue ?? '')
    .trim()
    .replace(/[,，\s]/g, '')
    .toLowerCase()
  if (!normalized) return false
  return /^(?:nt\$?|ntd|twd|us\$|usd|\$|¥)?\d+(?:\.\d+)?(?:k|w|萬|万|千|百|元(?:整)?|塊|块|美元|美金|台幣|臺幣|日圓|日元)?$/.test(normalized)
}

function extractCounterpartyFromLoanText(text, mode, direction) {
  const source = String(text ?? '')
  const patterns = []

  if (mode === 'create' && direction === 'lend') {
    patterns.push(
      /(?:借出|借了)\s*(?:nt\$?|ntd|twd|us\$|usd|\$|¥)?\s*\d[\d,]*(?:\.\d+)?(?:k|w|萬|万|千|百|元(?:整)?|塊|块|美元|美金|台幣|臺幣|日圓|日元)?\s*(?:給|借給)\s*([^\s，。,；;:：]{1,24})/i,
      /(?:借給|借了給|借出給|借出|借款給)\s*([^\s，。,；;:：]{1,24})/i,
      /給\s*([^\s，。,；;:：]{1,24})\s*(?:借|借款|借錢|借钱|借出)/i,
      /(?:lend(?:ing)?|loan(?:ed)?)\s+to\s+([a-zA-Z][a-zA-Z0-9._-]{0,23})/i,
      /([a-zA-Z][a-zA-Z0-9._-]{0,23})\s+(?:borrowed)\s+from\s+me/i,
      /([^\s，。,；;:：]{1,24})\s*に\s*貸した/i,
    )
  } else if (mode === 'create' && direction === 'borrow') {
    patterns.push(
      /(?:向|跟)\s*([^\s，。,；;:：]{1,24})\s*(?:借|借入|借款|借錢|借钱)/i,
      /(?:借入|借款|借錢|借钱)\s*([^\s，。,；;:：]{1,24})/i,
      /(?:borrow(?:ed)?|loan)\s+from\s+([a-zA-Z][a-zA-Z0-9._-]{0,23})/i,
      /([^\s，。,；;:：]{1,24})\s*から\s*借(?:りた|入れた)?/i,
    )
  } else if (mode === 'repay' && direction === 'lend') {
    patterns.push(
      /(?:收回|收到|收到了)\s*([^\s，。,；;:：]{1,24})/i,
      /([^\s，。,；;:：]{1,24})\s*(?:還我|还我)/i,
      /(?:received|got)\s+(?:repayment|payback)\s+from\s+([a-zA-Z][a-zA-Z0-9._-]{0,23})/i,
      /([^\s，。,；;:：]{1,24})\s*が\s*返済した/i,
    )
  } else if (mode === 'repay' && direction === 'borrow') {
    patterns.push(
      /(?:歸還|归还|還款|还款|還給|还给|還錢|还钱)\s*([^\s，。,；;:：]{1,24})/i,
      /(?:向|跟)\s*([^\s，。,；;:：]{1,24})\s*(?:歸還|归还|還款|还款|還錢|还钱)/i,
      /(?:repay(?:ed)?|pay(?:ing)?\s+back)\s+([a-zA-Z][a-zA-Z0-9._-]{0,23})/i,
      /([^\s，。,；;:：]{1,24})\s*に\s*返済した/i,
    )
  }

  for (const pattern of patterns) {
    const matched = pattern.exec(source)
    if (!matched) continue
    const normalized = normalizeCounterpartyName(matched[1])
    if (normalized) return normalized
  }
  return ''
}

function detectLoanIntent(text) {
  const source = String(text ?? '')
  const candidates = []
  for (const group of LOAN_INTENT_PATTERN_GROUPS) {
    const matched = firstPatternMatch(source, group.patterns)
    if (!matched) continue
    candidates.push({
      mode: group.mode,
      direction: group.direction,
      priority: group.priority,
      index: matched.index,
    })
  }

  if (!candidates.length) return null
  candidates.sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index
    return a.priority - b.priority
  })

  const top = candidates[0]
  return {
    mode: top.mode,
    direction: top.direction,
    counterpartyName: extractCounterpartyFromLoanText(source, top.mode, top.direction),
  }
}

function resolveTypeByLoanIntent(type, loanIntent) {
  if (!loanIntent) return type
  if (loanIntent.mode === 'create') {
    return loanIntent.direction === 'borrow' ? 'income' : 'expense'
  }
  return loanIntent.direction === 'borrow' ? 'expense' : 'income'
}

function shouldTreatAsTransfer(text, accounts) {
  const source = String(text ?? '')
  const compact = compactText(source)
  const matchedEntries = findAccountMatchEntries(source, accounts)
  const uniqueMatchedAccountIds = [...new Set(matchedEntries.map((item) => item?.account?.id).filter(Boolean))]
  const transferAccounts = pickTransferAccounts(source, accounts)
  const hasTwoDistinctAccounts = uniqueMatchedAccountIds.length >= 2
    || Boolean(
      transferAccounts.fromAccountId
      && transferAccounts.toAccountId
      && transferAccounts.fromAccountId !== transferAccounts.toAccountId,
    )
  if (!hasTwoDistinctAccounts) return false

  const hasDirectionalPhrase = includesAny(source, [
    /(從|由|自)\s*\S{0,16}\s*(到|至|給)/,
    /(由)\s*\S{0,16}\s*(轉給|轉到|匯給|匯到)/,
    /(轉|轉錢|轉款|匯|汇|挪|撥|拨|搬|移)\s*\S{0,18}\s*(到|至|給|入)/,
    /(到|至|給)\s*\S{0,18}\s*(轉|轉錢|轉款|匯|汇|挪|撥|拨|搬|移)/,
    /(帳戶|账户)\s*\S{0,18}\s*(互轉|互转)/,
    /\bfrom\b\s+\S{0,20}\s+\bto\b/i,
    /\btransfer\b\s+\S{0,20}\s+\bto\b/i,
    /\bmove\b\s+\S{0,20}\s+\bto\b/i,
    /から\s*\S{0,16}\s*へ/,
    /口座.*(振替|送金)/,
    /→|->|=>|➡/,
  ])
  const hasTransferAction = includesAny(source, [
    /轉帳|转账/,
    /轉給|转给/,
    /轉去|转去/,
    /轉到|转到/,
    /轉入|转入/,
    /轉出|转出/,
    /轉錢|转钱/,
    /轉款|转款/,
    /匯給|汇给/,
    /匯到|汇到/,
    /匯入|汇入/,
    /匯出|汇出/,
    /匯款|汇款/,
    /打款|打錢|打钱/,
    /轉來|转来/,
    /挪到|挪去|挪錢|挪钱|挪款/,
    /撥款|拨款|撥轉|拨转|調撥|调拨/,
    /搬錢|搬钱|搬款/,
    /移轉|过户|過戶/,
    /內轉|内转|互轉|互转/,
    /帳戶互轉|账户互转/,
    /\btransfer\b/i,
    /\bwire\b/i,
    /\bmove money\b/i,
    /\bsend money\b/i,
    /振込|送金|振替|口座間移動/,
  ])

  let hasBridgeBetweenMatchedAccounts = false
  if (matchedEntries.length >= 2) {
    for (let index = 0; index < matchedEntries.length - 1; index += 1) {
      const left = matchedEntries[index]
      const right = matchedEntries.find(
        (item, rightIndex) => rightIndex > index && item?.account?.id !== left?.account?.id,
      )
      if (!left || !right) continue

      const leftEnd = Number(left.index) + String(left.target ?? '').length
      const rightStart = Number(right.index)
      if (!Number.isFinite(leftEnd) || !Number.isFinite(rightStart) || rightStart <= leftEnd) continue

      const bridge = compact.slice(leftEnd, rightStart)
      if (/轉|匯|汇|到|至|給|→|->|=>|➡|挪|撥|拨|移|搬|to|from|transfer|wire|send|move|へ|から|振込|送金|振替/i.test(bridge)) {
        hasBridgeBetweenMatchedAccounts = true
        break
      }
    }
  }

  return hasDirectionalPhrase || hasTransferAction || hasBridgeBetweenMatchedAccounts
}

function normalizeReimbursable(text, fallback = false) {
  if (
    includesAny(text, [
      /不報[銷修]/,
      /不可報[銷修]/,
      /不需報[銷修]/,
      /不用報[銷修]/,
      /自費/,
      /non[-\s]?reimbursable/i,
      /not reimbursable/i,
      /personal expense/i,
      /立替不可|精算不可/,
    ])
  ) {
    return false
  }
  if (
    includesAny(text, [
      /可報[銷修]/,
      /可報帳/,
      /報[銷修]/,
      /報帳/,
      /請款/,
      /墊付/,
      /\breimbursable\b/i,
      /\breimburse\b/i,
      /expense claim/i,
      /立替|精算/,
    ])
  ) {
    return true
  }
  return fallback
}

function normalizeIncludeFlag(text, key, fallback) {
  if (key === 'budget') {
    if (includesAny(text, [/不計入預算/, /不算預算/, /不記預算/, /不列預算/, /不走預算/, /預算外/, /exclude from budget/i, /not in budget/i, /budget excluded/i, /予算(に)?含めない/])) return false
    if (includesAny(text, [/計入預算/, /算進預算/, /記入預算/, /納入預算/, /列入預算/, /include in budget/i, /count toward budget/i, /budget included/i, /予算(に)?含める/])) return true
    return fallback
  }

  if (includesAny(text, [/不計入收支/, /不計收支/, /不記收支/, /不計入分析/, /不算分析/, /收支外/, /分析外/, /exclude from analysis/i, /exclude from reports?/i, /not in analysis/i, /分析(に)?含めない/])) return false
  if (includesAny(text, [/計入收支/, /記錄收支/, /計入分析/, /算進分析/, /列入收支/, /列入分析/, /include in analysis/i, /include in reports?/i, /analyze this/i, /分析(に)?含める/])) return true
  return fallback
}

const EMPTY_TINY_NER_HINTS = {
  typeHint: '',
  typeConfidence: 0,
  amountMajor: NaN,
  amountConfidence: 0,
  accountIdHint: '',
  accountConfidence: 0,
  fromAccountIdHint: '',
  fromAccountConfidence: 0,
  toAccountIdHint: '',
  toAccountConfidence: 0,
  expenseCategoryIdHint: '',
  expenseCategoryConfidence: 0,
  incomeCategoryIdHint: '',
  incomeCategoryConfidence: 0,
  counterpartyNameHint: '',
  counterpartyConfidence: 0,
}

export function parseAutoBookkeepingText(input, context = {}) {
  const text = normalizeText(input)
  if (!text) {
    const warningKey = AI_BOOKKEEPING_WARNING_KEY.EMPTY_INPUT
    return {
      draft: null,
      warnings: [getAiBookkeepingWarningFallback(warningKey)],
      warningKeys: [warningKey],
    }
  }

  const normalizedBareText = normalizeBareTypeText(text)
  const earlyBareType = Object.entries(BARE_TYPE_INPUTS).find(([, candidates]) => candidates.has(normalizedBareText))?.[0] ?? ''
  if (earlyBareType) {
    const bareWarningKeys = [AI_BOOKKEEPING_WARNING_KEY.INVALID_AMOUNT]
    if (earlyBareType === 'transfer') {
      bareWarningKeys.push(AI_BOOKKEEPING_WARNING_KEY.TRANSFER_ACCOUNTS_INSUFFICIENT)
    }
    return {
      draft: null,
      warnings: bareWarningKeys.map((key) => getAiBookkeepingWarningFallback(key)),
      warningKeys: bareWarningKeys,
    }
  }

  const accounts = context.accounts ?? []
  const expenseCategories = context.expenseCategories ?? []
  const incomeCategories = context.incomeCategories ?? []
  const historyTransactions = context.historyTransactions ?? []
  const autoFillRules = context.autoFillRules ?? []
  const warningKeys = []
  const tinyNerHints = context.useTinyNer === false
    ? EMPTY_TINY_NER_HINTS
    : extractTinyNerHints(text, {
      accounts,
      expenseCategories,
      incomeCategories,
    })
  const warnings = []
  const rawType = Number(tinyNerHints.typeConfidence) >= 0.62 && tinyNerHints.typeHint
    ? tinyNerHints.typeHint
    : normalizeType(text)
  let loanIntent = detectLoanIntent(text)
  if (
    loanIntent
    && !loanIntent.counterpartyName
    && Number(tinyNerHints.counterpartyConfidence) >= 0.6
    && tinyNerHints.counterpartyNameHint
  ) {
    loanIntent = {
      ...loanIntent,
      counterpartyName: tinyNerHints.counterpartyNameHint,
    }
  }
  const inferredType = loanIntent
    ? resolveTypeByLoanIntent(rawType, loanIntent)
    : rawType === 'transfer' || shouldTreatAsTransfer(text, accounts)
      ? 'transfer'
      : rawType
  if (!loanIntent && isBareTypeOnlyInput(text, inferredType)) {
    const bareWarningKeys = [AI_BOOKKEEPING_WARNING_KEY.INVALID_AMOUNT]
    if (inferredType === 'transfer') {
      bareWarningKeys.push(AI_BOOKKEEPING_WARNING_KEY.TRANSFER_ACCOUNTS_INSUFFICIENT)
    }
    return {
      draft: null,
      warnings: bareWarningKeys.map((key) => getAiBookkeepingWarningFallback(key)),
      warningKeys: bareWarningKeys,
    }
  }
  const parsedAddon = extractAddonItems(text)
  let amountMajor = NaN
  if (inferredType === 'transfer') {
    amountMajor = parseAmountMajor(parsedAddon.strippedText)
  } else if (parsedAddon.items.length > 0) {
    // If addon fragments exist, primary amount must come from non-addon content.
    // This keeps addon numbers (e.g. 優惠5元) from being treated as transaction amount.
    amountMajor = parseAmountMajor(parsedAddon.strippedText)
  } else {
    amountMajor = parseAmountMajor(text)
  }
  const nerAmountMajor = Number(tinyNerHints.amountMajor)
  const nerAmountConfidence = Number(tinyNerHints.amountConfidence)
  const canUseNerAmount = Number.isFinite(nerAmountMajor) && nerAmountMajor > 0
  if ((!Number.isFinite(amountMajor) || amountMajor <= 0) && canUseNerAmount) {
    amountMajor = nerAmountMajor
  } else if (
    parsedAddon.items.length === 0
    && canUseNerAmount
    && nerAmountConfidence >= 0.88
  ) {
    amountMajor = nerAmountMajor
  }

  const historyAutoFill = loanIntent ? null : pickRecentHistoryAutoFill(
    text,
    historyTransactions,
    context.now ?? new Date(),
  )
  const matchedAutoFillRule = loanIntent ? null : pickMatchedAutoFillRule(text, autoFillRules)

  if ((!Number.isFinite(amountMajor) || amountMajor <= 0) && matchedAutoFillRule?.amountMajor > 0) {
    amountMajor = matchedAutoFillRule.amountMajor
  }

  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    appendAiBookkeepingWarning(warnings, warningKeys, AI_BOOKKEEPING_WARNING_KEY.INVALID_AMOUNT)
  }

  const occurredAt = parseDateTimeFromText(text, context.now ?? new Date())

  const matchedExpenseCategory = pickCategoryMatch(text, expenseCategories)
  const matchedIncomeCategory = pickCategoryMatch(text, incomeCategories)
  const learnedExpenseCategory = pickCategoryByHistoryLearning(
    text,
    expenseCategories,
    historyTransactions,
    'expense',
    context.now ?? new Date(),
  )
  const learnedIncomeCategory = pickCategoryByHistoryLearning(
    text,
    incomeCategories,
    historyTransactions,
    'income',
    context.now ?? new Date(),
  )
  const mealExpenseCategory = pickMealTimeCategory(text, expenseCategories)
  const semanticExpenseCategory = pickCategoryBySemanticRules(text, expenseCategories, EXPENSE_CATEGORY_SEMANTIC_RULES)
  const semanticIncomeCategory = pickCategoryBySemanticRules(text, incomeCategories, INCOME_CATEGORY_SEMANTIC_RULES)
  const cashbackIncomeCategory = pickCashbackIncomeCategory(text, incomeCategories)
  const nerExpenseCategory = Number(tinyNerHints.expenseCategoryConfidence) >= 0.68
    ? expenseCategories.find((item) => item.id === tinyNerHints.expenseCategoryIdHint) ?? null
    : null
  const nerIncomeCategory = Number(tinyNerHints.incomeCategoryConfidence) >= 0.68
    ? incomeCategories.find((item) => item.id === tinyNerHints.incomeCategoryIdHint) ?? null
    : null

  let type = inferredType
  if (
    matchedAutoFillRule?.type
    && type !== 'transfer'
    && matchedAutoFillRule.type !== type
  ) {
    type = matchedAutoFillRule.type
  }
  if (type !== 'transfer' && !loanIntent && !matchedAutoFillRule?.type) {
    const hasExpenseSignal = Boolean(matchedExpenseCategory || learnedExpenseCategory || semanticExpenseCategory || nerExpenseCategory)
    const hasIncomeSignal = Boolean(matchedIncomeCategory || learnedIncomeCategory || semanticIncomeCategory || nerIncomeCategory)
    if (hasExpenseSignal && !hasIncomeSignal) type = 'expense'
    if (hasIncomeSignal && !hasExpenseSignal) type = 'income'
  }

  let accountId = ''
  let peerAccountId = ''
  if (type === 'transfer') {
    const nerFromAccountId = Number(tinyNerHints.fromAccountConfidence) >= 0.6
      ? tinyNerHints.fromAccountIdHint
      : ''
    const nerToAccountId = Number(tinyNerHints.toAccountConfidence) >= 0.6
      ? tinyNerHints.toAccountIdHint
      : ''
    const transferAccounts = pickTransferAccounts(text, accounts)
    accountId = nerFromAccountId || transferAccounts.fromAccountId || ''
    peerAccountId = nerToAccountId || transferAccounts.toAccountId || ''

    if (!accountId && matchedAutoFillRule?.type === 'transfer') {
      accountId = matchedAutoFillRule.accountId || ''
    }
    if (!peerAccountId && matchedAutoFillRule?.type === 'transfer') {
      peerAccountId = matchedAutoFillRule.peerAccountId || ''
    }
    if (!accountId && historyAutoFill?.type === 'transfer') {
      accountId = historyAutoFill.accountId || ''
    }
    if (!peerAccountId && historyAutoFill?.type === 'transfer') {
      peerAccountId = historyAutoFill.peerAccountId || ''
    }

    if (accountId && peerAccountId && accountId === peerAccountId) {
      peerAccountId =
        transferAccounts.toAccountId && transferAccounts.toAccountId !== accountId
          ? transferAccounts.toAccountId
          : ''
    }

    if (!accountId || !peerAccountId || accountId === peerAccountId) {
      appendAiBookkeepingWarning(warnings, warningKeys, AI_BOOKKEEPING_WARNING_KEY.TRANSFER_ACCOUNTS_INSUFFICIENT)
    }
  } else {
    const nerAccountId = Number(tinyNerHints.accountConfidence) >= 0.62
      ? tinyNerHints.accountIdHint
      : ''
    accountId = nerAccountId || (pickClosestAccount(text, accounts)?.id ?? '')
    if (!accountId && matchedAutoFillRule && matchedAutoFillRule.type === type) {
      accountId = matchedAutoFillRule.accountId || ''
    }
    if (!accountId && historyAutoFill?.type === type) {
      accountId = historyAutoFill.accountId || ''
    }
  }

  let categoryId = ''
  let selectedCategoryName = ''
  if (type !== 'transfer' && !loanIntent) {
    if (type === 'income') {
      const selectedIncomeCategory =
        nerIncomeCategory ??
        matchedIncomeCategory ??
        cashbackIncomeCategory ??
        semanticIncomeCategory ??
        null
      categoryId = selectedIncomeCategory?.id ?? ''
      selectedCategoryName = String(selectedIncomeCategory?.name ?? '')
    } else {
      const selectedExpenseCategory =
        nerExpenseCategory ??
        matchedExpenseCategory ??
        mealExpenseCategory ??
        semanticExpenseCategory ??
        null
      categoryId = selectedExpenseCategory?.id ?? ''
      selectedCategoryName = String(selectedExpenseCategory?.name ?? '')
    }

    if (!categoryId) {
      if (matchedAutoFillRule?.type === type) {
        categoryId = matchedAutoFillRule.categoryId || ''
      }
      if (!categoryId) {
        categoryId = type === 'income'
          ? (learnedIncomeCategory?.id ?? '')
          : (learnedExpenseCategory?.id ?? '')
      }
      if (!categoryId && historyAutoFill?.type === type) {
        categoryId = historyAutoFill.categoryId || ''
      }
    }

    if (categoryId && !selectedCategoryName) {
      const categoryList = type === 'income' ? incomeCategories : expenseCategories
      selectedCategoryName = String(categoryList.find((item) => item.id === categoryId)?.name ?? '')
    }

    if (!categoryId) {
      appendAiBookkeepingWarning(warnings, warningKeys, AI_BOOKKEEPING_WARNING_KEY.NO_CATEGORY)
    }
  }

  let addonItems = consumeCategoryCashbackAddon(parsedAddon.items, selectedCategoryName, text)
  if (matchedAutoFillRule?.addonItems?.length) {
    addonItems = mergeUniqueAddonItems(addonItems, matchedAutoFillRule.addonItems)
  }

  if (type !== 'transfer') {
    if (!accountId && !loanIntent) {
      accountId = pickRecentAccountByCategory(historyTransactions, accounts, type, categoryId)
    }
    if (!accountId) {
      accountId = accounts[0]?.id ?? ''
    }
    if (!accountId) {
      appendAiBookkeepingWarning(warnings, warningKeys, AI_BOOKKEEPING_WARNING_KEY.NO_ACCOUNT)
    }
  }

  if (loanIntent && !loanIntent.counterpartyName) {
    appendAiBookkeepingWarning(warnings, warningKeys, AI_BOOKKEEPING_WARNING_KEY.NO_COUNTERPARTY)
  }

  let isReimbursable = type === 'expense' ? normalizeReimbursable(text, false) : false
  if (type === 'expense' && !isReimbursable && matchedAutoFillRule?.type === 'expense' && matchedAutoFillRule.isReimbursable) {
    isReimbursable = true
  }

  let includeInBudget = type === 'transfer' ? false : !isReimbursable
  let includeInAnalysis = type === 'transfer' ? false : !isReimbursable
  includeInBudget = normalizeIncludeFlag(text, 'budget', includeInBudget)
  includeInAnalysis = normalizeIncludeFlag(text, 'analysis', includeInAnalysis)

  const noteCategories = loanIntent ? [] : type === 'income' ? incomeCategories : expenseCategories
  const autoNote = extractSmartNoteText(text, {
    accounts,
    selectedCategoryName,
    categories: noteCategories,
  })
  let noteText = autoNote
  if (!noteText && matchedAutoFillRule?.note) {
    noteText = matchedAutoFillRule.note
  }
  if (noteText && matchedAutoFillRule?.note && !noteText.includes(matchedAutoFillRule.note)) {
    noteText = `${matchedAutoFillRule.note} ${noteText}`.trim()
  }

  const draft = {
    sourceText: text,
    type,
    amountMajor: Number.isFinite(amountMajor) ? amountMajor : 0,
    occurredAt,
    accountId,
    peerAccountId,
    categoryId,
    note: noteText,
    addonItems,
    isReimbursable,
    includeInBudget,
    includeInAnalysis,
    loanIntent: loanIntent
      ? {
        mode: loanIntent.mode,
        direction: loanIntent.direction,
        counterpartyName: loanIntent.counterpartyName,
      }
      : null,
  }

  return {
    draft: {
      ...draft,
      amountMinor: toMinor(draft.amountMajor),
    },
    warnings,
    warningKeys,
  }
}
