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

const NOTE_LABEL_PATTERNS = [
  /備註/,
  /备注/,
  /註記|注記/,
  /\bmemo\b/i,
  /\bremark\b/i,
  /\bnote\b/i,
]

function isExplicitNoteContext(text, start, end = start) {
  const source = String(text ?? '')
  const localStart = Math.max(0, Number(start) || 0)
  const localEnd = Math.max(localStart, Number(end) || localStart)
  const left = source.slice(Math.max(0, localStart - 18), localStart)
  const around = source.slice(Math.max(0, localStart - 18), Math.min(source.length, localEnd + 4))
  return includesAny(left, NOTE_LABEL_PATTERNS) || includesAny(around, NOTE_LABEL_PATTERNS)
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
  if (/[+\-*/]/.test(left) || /[+\-*/]/.test(right)) return false

  return true
}

export function parseAmountMajor(text) {
  const formulaAmount = parseFormulaAmountMajor(text)
  if (Number.isFinite(formulaAmount) && formulaAmount > 0) {
    return formulaAmount
  }

  const withUnit = [
    ...text.matchAll(
      /([+-]?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)\s*(萬|w|千|k|百|元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\$|\$|¥|￥)/gi,
    ),
  ].filter((item) => !isExplicitNoteContext(text, item.index, item.index + String(item[0] ?? '').length))
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
    .filter((item) => !isExplicitNoteContext(text, item.index, item.index + String(item[0] ?? '').length))
    .map((item) => parseLooseNumber(item[1]))
    .filter((item) => Number.isFinite(item) && Math.abs(item) > 0)
    .map((item) => Math.abs(item))

  if (!allNumbers.length) return Number.NaN

  const year = text.match(/(\d{4})\s*(?:[./-]|年)\s*(\d{1,2})\s*(?:[./-]|月)\s*(\d{1,2})(?:日)?/)?.[1]
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

function parseFormulaAmountMajor(text) {
  const matches = [
    ...String(text ?? '').matchAll(/(?:\d+(?:\.\d+)?\s*[+\-×÷*/]\s*)+\d+(?:\.\d+)?/g),
  ]

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = String(matches[index]?.[0] ?? '').trim()
    const candidateStart = Number(matches[index]?.index ?? -1)
    if (!candidate) continue
    if (candidateStart >= 0 && isExplicitNoteContext(text, candidateStart, candidateStart + candidate.length)) continue
    const normalized = candidate.replace(/\s+/g, '')
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) continue
    if (/^\d{1,2}\/\d{1,2}$/.test(normalized)) continue
    const value = evaluateArithmeticExpression(candidate)
    if (Number.isFinite(value) && value > 0) {
      return value
    }
  }

  return Number.NaN
}

function parseSignedFormulaAmountMajor(text) {
  const matches = [
    ...String(text ?? '').matchAll(/[+-]?(?:\d+(?:\.\d+)?\s*[+\-×÷*/]\s*)+\d+(?:\.\d+)?/g),
  ]

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = String(matches[index]?.[0] ?? '').trim()
    const candidateStart = Number(matches[index]?.index ?? -1)
    if (!candidate) continue
    if (candidateStart >= 0 && isExplicitNoteContext(text, candidateStart, candidateStart + candidate.length)) continue
    const normalized = candidate.replace(/\s+/g, '')
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) continue
    if (/^\d{1,2}\/\d{1,2}$/.test(normalized)) continue
    const value = evaluateArithmeticExpression(candidate)
    if (Number.isFinite(value) && value !== 0) {
      return round2(value)
    }
  }

  return Number.NaN
}

export function parseSignedAmountMajor(text) {
  const formulaAmount = parseSignedFormulaAmountMajor(text)
  if (Number.isFinite(formulaAmount) && formulaAmount !== 0) {
    return formulaAmount
  }

  const withUnit = [
    ...String(text ?? '').matchAll(
      /([+-]?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)\s*(萬|w|千|k|百|元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\$|\$|¥|￥)/gi,
    ),
  ].filter((item) => !isExplicitNoteContext(text, item.index, item.index + String(item[0] ?? '').length))
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

  const signedNumbers = [...String(text ?? '').matchAll(/([+-](?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)/g)]
    .filter((item) => !isExplicitNoteContext(text, item.index, item.index + String(item[0] ?? '').length))
    .map((item) => parseLooseNumber(item[1]))
    .filter((item) => Number.isFinite(item) && item !== 0)
  if (signedNumbers.length > 0) {
    return round2(signedNumbers[signedNumbers.length - 1])
  }

  return parseAmountMajor(text)
}

function evaluateArithmeticExpression(input) {
  const source = String(input ?? '').trim()
  if (!source) return null
  if (!/^[0-9+\-×÷*/.\s]+$/.test(source)) return null

  const normalized = source.replaceAll('×', '*').replaceAll('÷', '/').replace(/\s+/g, '')
  const tokens = normalized.match(/(\d+(?:\.\d+)?)|[+\-*/]/g)
  if (!tokens?.length) return null

  const nums = []
  const ops = []
  let expectingNumber = true

  for (const token of tokens) {
    if (['+', '-', '*', '/'].includes(token)) {
      if (expectingNumber) {
        if (token === '-' && nums.length === 0) {
          nums.push(0)
        } else {
          return null
        }
      }
      while (ops.length && arithmeticPrecedence(ops.at(-1)) >= arithmeticPrecedence(token)) {
        if (!applyArithmeticOperator(nums, ops.pop())) return null
      }
      ops.push(token)
      expectingNumber = true
      continue
    }

    const num = Number(token)
    if (!Number.isFinite(num)) return null
    nums.push(num)
    expectingNumber = false
  }

  if (expectingNumber) return null
  while (ops.length) {
    if (!applyArithmeticOperator(nums, ops.pop())) return null
  }

  const result = nums[0]
  if (!Number.isFinite(result)) return null
  return round2(Math.abs(result))
}

function arithmeticPrecedence(op) {
  if (op === '+' || op === '-') return 1
  if (op === '*' || op === '/') return 2
  return 0
}

function applyArithmeticOperator(nums, op) {
  if (nums.length < 2) return false
  const b = nums.pop()
  const a = nums.pop()
  if (op === '/' && b === 0) return false
  const result = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b
  if (!Number.isFinite(result)) return false
  nums.push(result)
  return true
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
