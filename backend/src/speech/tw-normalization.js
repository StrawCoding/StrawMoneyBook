const CHINESE_DIGIT_MAP = {
  '零': 0,
  '〇': 0,
  '○': 0,
  '一': 1,
  '二': 2,
  '兩': 2,
  '两': 2,
  '三': 3,
  '四': 4,
  '五': 5,
  '六': 6,
  '七': 7,
  '八': 8,
  '九': 9,
}

const CHINESE_SMALL_UNIT_MAP = {
  '十': 10,
  '百': 100,
  '千': 1000,
}

const CHINESE_BIG_UNIT_MAP = {
  '萬': 10000,
  '万': 10000,
  '億': 100000000,
  '亿': 100000000,
}

const TAIWAN_ALIAS_RULES = Object.freeze([
  { canonical: '台灣Pay', patterns: [/台灣\s*pay/gi, /臺灣\s*pay/gi, /台湾\s*pay/gi, /台灣配/gi, /臺灣配/gi] },
  { canonical: '悠遊付', patterns: [/悠遊付/gi, /悠悠付/gi, /悠遊富/gi] },
  { canonical: '悠遊卡', patterns: [/悠遊卡/gi, /悠悠卡/gi, /悠游卡/gi] },
  { canonical: 'iPASS Money', patterns: [/ipass\s*money/gi, /一卡通\s*money/gi, /愛配司\s*money/gi, /一卡通錢包/gi] },
  { canonical: '現金', patterns: [/現今/g, /現京/g] },
  { canonical: '信用卡', patterns: [/信勇卡/g, /信用咭/g, /信玉卡/g] },
  { canonical: '國泰', patterns: [/國太/g, /國態/g] },
  { canonical: '玉山', patterns: [/玉善/g, /玉杉/g] },
  { canonical: '中信', patterns: [/中心銀行/g, /中興銀行/g, /中信/g] },
  { canonical: '台新', patterns: [/台信/g, /臺新/g] },
  { canonical: '郵局', patterns: [/郵居/g, /油局/g] },
  { canonical: '台銀', patterns: [/臺銀/g, /台營/g, /臺營/g] },
  { canonical: '早餐', patterns: [/早參/g, /早餐/g] },
  { canonical: '午餐', patterns: [/午參/g, /午餐/g] },
  { canonical: '晚餐', patterns: [/晚參/g, /晚餐/g] },
  { canonical: '飲料', patterns: [/飲聊/g, /銀料/g] },
  { canonical: '交通', patterns: [/交統/g, /交通/g] },
  { canonical: '生活用品', patterns: [/生活用瓶/g, /生活用品/g] },
  { canonical: '轉帳', patterns: [/轉脹/g, /轉賬/g, /轉帳/g] },
  { canonical: '提款', patterns: [/提領/g, /提寬/g] },
  { canonical: '報銷', patterns: [/報消/g, /報帳/g, /報銷/g] },
])

const RELATIVE_DATE_RULES = Object.freeze([
  { canonical: '今天', patterns: [/今日/g] },
  { canonical: '昨天', patterns: [/昨晚(?=.*花|支出|買|付)/g] },
  { canonical: '前天', patterns: [/前兩天/g] },
  { canonical: '這週', patterns: [/這禮拜/g, /這星期/g, /本週/g, /本星期/g] },
  { canonical: '上週', patterns: [/上禮拜/g, /上星期/g] },
])

const ADDON_EXPECTATION_PATTERNS = [
  /手續費/,
  /服務費/,
  /運費/,
  /折扣/,
  /優惠/,
  /回饋/,
  /稅金?/,
  /停車費/,
  /外送費/,
]

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/[，、。]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseChineseIntegerToken(token) {
  let total = 0
  let section = 0
  let num = 0

  for (const char of token) {
    if (char in CHINESE_DIGIT_MAP) {
      num = CHINESE_DIGIT_MAP[char]
      continue
    }
    if (char in CHINESE_SMALL_UNIT_MAP) {
      const unit = CHINESE_SMALL_UNIT_MAP[char]
      if (num === 0) num = 1
      section += num * unit
      num = 0
      continue
    }
    if (char in CHINESE_BIG_UNIT_MAP) {
      const unit = CHINESE_BIG_UNIT_MAP[char]
      section += num
      total += section * unit
      section = 0
      num = 0
    }
  }

  return total + section + num
}

function parseColloquialChineseMoneyToken(token) {
  const source = String(token ?? '').trim()
  if (!source) return null

  const shorthandRules = [
    {
      pattern: /^([一二兩两三四五六七八九])百([一二兩两三四五六七八九])$/,
      resolve: ([, hundreds, tail]) => CHINESE_DIGIT_MAP[hundreds] * 100 + CHINESE_DIGIT_MAP[tail] * 10,
    },
    {
      pattern: /^([一二兩两三四五六七八九])千([一二兩两三四五六七八九])$/,
      resolve: ([, thousands, tail]) => CHINESE_DIGIT_MAP[thousands] * 1000 + CHINESE_DIGIT_MAP[tail] * 100,
    },
    {
      pattern: /^([一二兩两三四五六七八九])萬([一二兩两三四五六七八九])$/,
      resolve: ([, tenThousands, tail]) => CHINESE_DIGIT_MAP[tenThousands] * 10000 + CHINESE_DIGIT_MAP[tail] * 1000,
    },
    {
      pattern: /^([一二兩两三四五六七八九])千([一二兩两三四五六七八九])百([一二兩两三四五六七八九])$/,
      resolve: ([, thousands, hundreds, tail]) => (
        CHINESE_DIGIT_MAP[thousands] * 1000
        + CHINESE_DIGIT_MAP[hundreds] * 100
        + CHINESE_DIGIT_MAP[tail] * 10
      ),
    },
  ]

  for (const rule of shorthandRules) {
    const matched = source.match(rule.pattern)
    if (matched) {
      return Number(rule.resolve(matched))
    }
  }

  return parseChineseIntegerToken(source)
}

function replaceChineseNumberTokens(text) {
  const tokenPattern = /[負负]?(?=[零〇○一二兩两三四五六七八九十百千萬万億亿點点]*[零〇○一二兩两三四五六七八九十百千萬万億亿])[零〇○一二兩两三四五六七八九十百千萬万億亿點点]+/g
  return text.replace(tokenPattern, (token) => {
    const unsigned = token.replace(/^[負负]/, '')
    const isNegative = token !== unsigned
    if (unsigned.includes('點') || unsigned.includes('点')) {
      const [left, right] = unsigned.split(/[點点]/)
      const integerPart = parseColloquialChineseMoneyToken(left || '零')
      const decimalDigits = String(right ?? '')
        .split('')
        .map((char) => (char in CHINESE_DIGIT_MAP ? String(CHINESE_DIGIT_MAP[char]) : ''))
        .join('')
      const parsed = Number(`${integerPart}.${decimalDigits}`)
      if (!Number.isFinite(parsed)) return token
      return String(isNegative ? -parsed : parsed)
    }

    const parsed = parseColloquialChineseMoneyToken(unsigned)
    if (!Number.isFinite(parsed)) return token
    return String(isNegative ? -parsed : parsed)
  })
}

function normalizeColloquialMoneyPhrases(text) {
  return text.replace(
    /([負负]?[零〇○一二兩两三四五六七八九十百千萬万億亿]+)(塊半|元半|塊錢半|塊|塊錢|元)/g,
    (matched, rawToken, unit) => {
      const amount = parseColloquialChineseMoneyToken(rawToken)
      if (!Number.isFinite(amount)) return matched
      const normalizedAmount = /半$/.test(unit) ? amount + 0.5 : amount
      return `${normalizedAmount}元`
    },
  )
}

function applyRules(text, rules, appliedRules) {
  let output = text
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const tester = new RegExp(pattern.source, pattern.flags)
      if (!tester.test(output)) continue
      output = output.replace(pattern, rule.canonical)
      appliedRules.push(rule.canonical)
    }
  }
  return output
}

export function detectSpeechAddonExpectation(text) {
  const source = String(text ?? '')
  return ADDON_EXPECTATION_PATTERNS.some((pattern) => pattern.test(source))
}

export function normalizeTaiwaneseSpeechText(text) {
  const appliedRules = []
  let normalized = normalizeWhitespace(text)
  normalized = applyRules(normalized, RELATIVE_DATE_RULES, appliedRules)
  normalized = applyRules(normalized, TAIWAN_ALIAS_RULES, appliedRules)
  normalized = normalizeColloquialMoneyPhrases(normalized)
  normalized = replaceChineseNumberTokens(normalized)
  normalized = normalized
    .replace(/這個月/g, '本月')
    .replace(/上個月/g, '上月')
    .replace(/下個月/g, '下月')
    .replace(/禮拜/g, '週')
  normalized = normalizeWhitespace(normalized)
  return {
    originalText: String(text ?? ''),
    normalizedText: normalized,
    appliedRules: Array.from(new Set(appliedRules)),
  }
}
