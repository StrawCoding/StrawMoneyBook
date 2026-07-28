import {
  evaluateAmountExpression,
  normalizeAmountExpressionSource,
} from '../utils/amount-expression.js'

export function normalizeText(value) {
  return String(value ?? '')
    .replace(/[，、。]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function compactText(value) {
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
  adjustment: new Set(['結餘', '余额', '餘額', 'adjustment', 'balance']),
  transfer: new Set(['轉帳', '转账', 'transfer']),
})

export function isBareTypeOnlyInput(text, type) {
  const normalizedType = String(type ?? '').trim()
  const candidates = BARE_TYPE_INPUTS[normalizedType]
  if (!candidates) return false
  const normalizedText = normalizeBareTypeText(text)
  if (!normalizedText) return false
  return candidates.has(normalizedText)
}

export function toMinor(major) {
  return Math.round(Number(major) * 100)
}

export function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

function parseLooseNumber(rawValue) {
  const normalized = String(rawValue ?? '')
    .trim()
    .replace(/[,\s]/g, '')
  if (!normalized) return Number.NaN
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export const NOTE_LABEL_PATTERNS = [
  /備註/,
  /备注/,
  /註記|注記/,
  /\bmemo\b/i,
  /\bremark\b/i,
  /\bnote\b/i,
]

const SCALE_UNIT_PATTERN = '萬|w|千|k|百'
const CURRENCY_UNIT_PATTERN = '元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\\$|\\$|¥|￥'
const FORMULA_OPERAND = `(?:\\d{1,3}(?:[,\\s]\\d{3})+|\\d+)(?:\\.\\d+)?\\s*(?:${SCALE_UNIT_PATTERN})?`
const FORMULA_BODY = `(?:${FORMULA_OPERAND}\\s*[+\\-×÷*/xX]\\s*)+${FORMULA_OPERAND}`
const FORMULA_WITH_UNIT_PATTERN = new RegExp(
  `[+-]?${FORMULA_BODY}(?:\\s*(?:${CURRENCY_UNIT_PATTERN}))?`,
  'gi',
)

/**
 * Amount / formula tokens are only treated as "inside an explicit note"
 * when a note label appears to the LEFT of the token. A trailing
 * `備註：...` after a real amount must not hide that amount.
 */
export function isExplicitNoteContext(text, start, _end = start) {
  const source = String(text ?? '')
  const localStart = Math.max(0, Number(start) || 0)
  const left = source.slice(Math.max(0, localStart - 24), localStart)
  return includesAny(left, NOTE_LABEL_PATTERNS)
}

/**
 * Remove explicit `備註：...` / `note:...` segments so amount parsers only
 * see free transaction text. Optional category names stop the note body
 * before a trailing `分類 金額` clause; otherwise a generic trailing
 * `詞 金額` boundary is used.
 */
export function stripExplicitNoteLabeledSegments(text, categoryNames = []) {
  const source = String(text ?? '')
  const ranges = []
  const labelPattern = /(?:備註|备注|註記|注記|\bmemo\b|\bremark\b|\bnote\b)\s*[:：]\s*/gi
  const sortedCategoryNames = [...(categoryNames ?? [])]
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  const trailingAmountTail = String.raw`[+-]?(?:(?:\d+(?:\.\d+)?\s*(?:萬|w|千|k|百)?\s*[+\-×÷*/xX]\s*)*\d+(?:\.\d+)?\s*(?:萬|w|千|k|百|元|塊|塊錢)?)`

  let matched = labelPattern.exec(source)
  while (matched) {
    const labelStart = matched.index
    const bodyStart = labelStart + String(matched[0] ?? '').length
    let bodyEnd = source.length
    const afterLabel = source.slice(bodyStart)

    for (const categoryName of sortedCategoryNames) {
      const boundary = new RegExp(
        `(?:^|[\\s，,])${escapeRegExp(categoryName)}\\s*${trailingAmountTail}`,
        'i',
      )
      const found = afterLabel.search(boundary)
      if (found >= 0) {
        bodyEnd = bodyStart + found
        break
      }
    }

    if (bodyEnd === source.length) {
      const genericBoundary = afterLabel.search(
        new RegExp(`(?:^|[\\s，,])[\\u4e00-\\u9fffA-Za-z]{1,12}\\s*${trailingAmountTail}\\s*$`, 'i'),
      )
      if (genericBoundary >= 0) {
        bodyEnd = bodyStart + genericBoundary
      }
    }

    ranges.push({
      start: labelStart,
      end: Math.max(bodyEnd, labelStart + String(matched[0] ?? '').length),
    })
    matched = labelPattern.exec(source)
  }

  if (!ranges.length) return source
  return stripTextByRanges(source, ranges)
}

export function includesAny(text, patterns) {
  return patterns.some((pattern) => {
    const cloned = new RegExp(pattern.source, pattern.flags)
    return cloned.test(text)
  })
}

export function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseDateTimeFromText(text, now = new Date()) {
  const base = new Date(now)
  base.setSeconds(0, 0)
  const source = String(text ?? '')

  if (/前天|おととい|day\s+before\s+yesterday/i.test(source)) {
    base.setDate(base.getDate() - 2)
  } else if (/昨天|昨日|yesterday/i.test(source)) {
    base.setDate(base.getDate() - 1)
  } else if (/明天|明日|tomorrow/i.test(source)) {
    base.setDate(base.getDate() + 1)
  }

  const ymd = findSafeDateMatch(
    source,
    /(\d{4})\s*(?:[./-]|年)\s*(\d{1,2})\s*(?:[./-]|月)\s*(\d{1,2})(?:日)?/g,
  )
  if (ymd) {
    const year = Number(ymd[1])
    const month = Number(ymd[2]) - 1
    const day = Number(ymd[3])
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      base.setFullYear(year, month, day)
    }
  } else {
    const md = findSafeDateMatch(
      source,
      /(\d{1,2})\s*(?:[./-]|月)\s*(\d{1,2})(?:日)?/g,
    )
    if (md) {
      const month = Number(md[1]) - 1
      const day = Number(md[2])
      if (
        Number.isFinite(month)
        && Number.isFinite(day)
        && month >= 0
        && month <= 11
        && day >= 1
        && day <= 31
      ) {
        base.setMonth(month, day)
      }
    }
  }

  const hm = findSafeTimeMatch(
    source,
    /([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)\s*(am|pm|a\.m\.|p\.m\.|午前|午後)?/gi,
  )
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

  const hourOnly = findSafeTimeMatch(
    source,
    /(凌晨|早上|上午|中午|下午|晚上|午前|午後|morning|afternoon|evening|night)?\s*(\d{1,2})\s*(點|时|時|o'clock|oclock)?(?:\s*(\d{1,2})\s*(?:分|min|minutes?)?)?\s*(am|pm|a\.m\.|p\.m\.)?/gi,
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

function findSafeDateMatch(text, pattern) {
  for (const match of String(text ?? '').matchAll(pattern)) {
    if (isSafeDateOrTimeMatch(text, match)) return match
  }
  return null
}

function findSafeTimeMatch(text, pattern) {
  for (const match of String(text ?? '').matchAll(pattern)) {
    if (isSafeDateOrTimeMatch(text, match)) return match
  }
  return null
}

function isSafeDateOrTimeMatch(text, match) {
  const source = String(text ?? '')
  const matchedText = String(match?.[0] ?? '')
  const start = Number(match?.index ?? -1)
  if (!matchedText || start < 0) return false
  const end = start + matchedText.length
  const left = source[start - 1] ?? ''
  const right = source[end] ?? ''

  if (/\d/.test(left) || /\d/.test(right)) return false
  if (/[+\-×÷*/]/.test(left) || /[+\-×÷*/]/.test(right)) return false

  return true
}

export function parseAmountMajor(text) {
  const source = stripExplicitNoteLabeledSegments(text)
  const formulaAmount = parseFormulaAmountMajor(source)
  if (Number.isFinite(formulaAmount) && formulaAmount > 0) {
    return formulaAmount
  }

  const withUnit = [
    ...source.matchAll(
      /([+-]?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)\s*(萬|w|千|k|百|元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\$|\$|¥|￥)/gi,
    ),
  ].filter((item) => !isExplicitNoteContext(source, item.index, item.index + String(item[0] ?? '').length))
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

  const allNumbers = [...source.matchAll(/([+-]?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)/g)]
    .filter((item) => !isExplicitNoteContext(source, item.index, item.index + String(item[0] ?? '').length))
    .map((item) => parseLooseNumber(item[1]))
    .filter((item) => Number.isFinite(item) && Math.abs(item) > 0)
    .map((item) => Math.abs(item))

  if (!allNumbers.length) return Number.NaN

  const year = source.match(/(\d{4})\s*(?:[./-]|年)\s*(\d{1,2})\s*(?:[./-]|月)\s*(\d{1,2})(?:日)?/)?.[1]
  const yearNum = Number(year)
  const candidates = allNumbers.filter((value) => {
    if (Number.isFinite(yearNum) && value === yearNum) return false
    return value >= 0.01 && value <= 9999999
  })

  if (!candidates.length) return Number.NaN

  const sorted = [...candidates].sort((a, b) => b - a)
  const candidate = sorted.find((value) => value >= 1 && value <= 999999) ?? sorted[0]
  return round2(candidate)
}

function scaleUnitFactor(unit) {
  const normalized = String(unit ?? '').trim().toLowerCase()
  if (normalized === '萬' || normalized === 'w') return 10000
  if (normalized === '千' || normalized === 'k') return 1000
  if (normalized === '百') return 100
  return 1
}

function expandScaleUnitsInExpression(input) {
  return String(input ?? '').replace(
    /(\d+(?:\.\d+)?)\s*(萬|w|千|k|百)/gi,
    (_, rawNumber, rawUnit) => {
      const amount = Number(String(rawNumber).replace(/[,\s]/g, ''))
      if (!Number.isFinite(amount)) return String(rawNumber)
      return String(round2(amount * scaleUnitFactor(rawUnit)))
    },
  )
}

function stripTrailingCurrencyUnit(input) {
  return String(input ?? '')
    .replace(new RegExp(`(?:${CURRENCY_UNIT_PATTERN})\\s*$`, 'i'), '')
    .trim()
}

function evaluateBookkeepingFormula(candidate) {
  const withoutCurrency = stripTrailingCurrencyUnit(candidate)
  const expanded = expandScaleUnitsInExpression(withoutCurrency)
  const normalized = normalizeAmountExpressionSource(expanded)
  if (!normalized) return null
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) return null
  if (/^\d{1,2}\/\d{1,2}$/.test(normalized)) return null
  if (!/[+\-*/]/.test(normalized)) return null
  const value = evaluateAmountExpression(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  return round2(value)
}

function parseFormulaAmountMajor(text) {
  const matches = [...String(text ?? '').matchAll(FORMULA_WITH_UNIT_PATTERN)]

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = String(matches[index]?.[0] ?? '').trim()
    const candidateStart = Number(matches[index]?.index ?? -1)
    if (!candidate) continue
    if (candidateStart >= 0 && isExplicitNoteContext(text, candidateStart, candidateStart + candidate.length)) continue
    const value = evaluateBookkeepingFormula(candidate)
    if (Number.isFinite(value) && value > 0) {
      return value
    }
  }

  return Number.NaN
}

function parseSignedFormulaAmountMajor(text) {
  const matches = [...String(text ?? '').matchAll(FORMULA_WITH_UNIT_PATTERN)]

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = String(matches[index]?.[0] ?? '').trim()
    const candidateStart = Number(matches[index]?.index ?? -1)
    if (!candidate) continue
    if (candidateStart >= 0 && isExplicitNoteContext(text, candidateStart, candidateStart + candidate.length)) continue
    const value = evaluateBookkeepingFormula(candidate)
    if (Number.isFinite(value) && value !== 0) {
      return round2(value)
    }
  }

  return Number.NaN
}

export function parseSignedAmountMajor(text) {
  const source = stripExplicitNoteLabeledSegments(text)
  const formulaAmount = parseSignedFormulaAmountMajor(source)
  if (Number.isFinite(formulaAmount) && formulaAmount !== 0) {
    return formulaAmount
  }

  const withUnit = [
    ...String(source ?? '').matchAll(
      /([+-]?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)\s*(萬|w|千|k|百|元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\$|\$|¥|￥)/gi,
    ),
  ].filter((item) => !isExplicitNoteContext(source, item.index, item.index + String(item[0] ?? '').length))
  if (withUnit.length > 0) {
    const target = withUnit[withUnit.length - 1]
    const raw = parseLooseNumber(target[1])
    const unit = String(target[2] ?? '').toLowerCase()
    if (Number.isFinite(raw) && raw !== 0) {
      if (unit === '萬' || unit === 'w') return round2(raw * 10000)
      if (unit === '千' || unit === 'k') return round2(raw * 1000)
      if (unit === '百') return round2(raw * 100)
      return round2(raw)
    }
  }

  const signedNumbers = [...String(source ?? '').matchAll(/([+-](?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)/g)]
    .filter((item) => !isExplicitNoteContext(source, item.index, item.index + String(item[0] ?? '').length))
    .map((item) => parseLooseNumber(item[1]))
    .filter((item) => Number.isFinite(item) && item !== 0)
  if (signedNumbers.length > 0) {
    return round2(signedNumbers[signedNumbers.length - 1])
  }

  return parseAmountMajor(source)
}

export function parseAmountWithUnit(rawAmount, rawUnit = '') {
  const amount = Math.abs(parseLooseNumber(rawAmount))
  if (!Number.isFinite(amount) || amount <= 0) return Number.NaN
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

export function stripTextSegments(text, ranges) {
  return stripTextByRanges(text, ranges)
}
