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

function round2(value) {
  return Math.round(Number(value) * 100) / 100
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
  return patterns.some((pattern) => pattern.test(text))
}

function countPatternHits(text, patterns) {
  let hits = 0
  for (const pattern of patterns) {
    const cloned = new RegExp(pattern.source, pattern.flags)
    let matched = cloned.exec(text)
    while (matched) {
      hits += 1
      if (matched.index === cloned.lastIndex) {
        cloned.lastIndex += 1
      }
      matched = cloned.exec(text)
    }
  }
  return hits
}

function sigmoid(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0.5
  if (numeric >= 20) return 1
  if (numeric <= -20) return 0
  return 1 / (1 + Math.exp(-numeric))
}

function softmax(scores) {
  const entries = Object.entries(scores)
  if (!entries.length) return {}
  const max = Math.max(...entries.map(([, value]) => Number(value)))
  const exps = entries.map(([key, value]) => [key, Math.exp(Number(value) - max)])
  const sum = exps.reduce((total, [, value]) => total + value, 0)
  if (!sum) {
    return Object.fromEntries(entries.map(([key]) => [key, 0]))
  }
  return Object.fromEntries(exps.map(([key, value]) => [key, value / sum]))
}

function toEntity(label, text, start, end, score, value = null, meta = null) {
  return {
    label,
    text,
    start,
    end,
    score: round2(Number(score)),
    value,
    meta,
  }
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
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

function buildAccountAliases(name) {
  const raw = String(name ?? '').trim()
  if (!raw) return []
  const aliases = []
  const seen = new Set()
  const pushAlias = (value) => {
    const alias = String(value ?? '').trim()
    if (alias.length < 2) return
    const compactAlias = compactText(alias)
    if (!compactAlias) return
    if (/^\d+$/.test(compactAlias)) return
    if (ACCOUNT_NAME_GENERIC_TARGETS.has(compactAlias)) return
    if (seen.has(compactAlias)) return
    seen.add(compactAlias)
    aliases.push(alias)
  }

  pushAlias(raw)
  pushAlias(stripAccountNameSuffix(raw))
  const parts = raw
    .replace(/[()（）[\]【】]/g, ' ')
    .split(/[\s\-_/,.，。:：]+/)
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)

  for (const part of parts) {
    pushAlias(part)
    pushAlias(stripAccountNameSuffix(part))
  }
  return aliases
}

function findAllPositions(text, needle) {
  const source = String(text ?? '')
  const target = String(needle ?? '').trim()
  if (!source || !target) return []
  const lowerSource = source.toLowerCase()
  const lowerNeedle = target.toLowerCase()
  const positions = []
  let offset = lowerSource.indexOf(lowerNeedle)
  while (offset >= 0) {
    positions.push(offset)
    offset = lowerSource.indexOf(lowerNeedle, offset + 1)
  }
  return positions
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

function isLikelyDateOrTimeToken(text, start, end, hasUnit) {
  if (hasUnit) return false
  const source = String(text ?? '')
  const left = source[Math.max(0, start - 1)] ?? ''
  const right = source[Math.min(source.length - 1, end)] ?? ''
  if (/[/:：-]/.test(left) || /[/:：-]/.test(right)) return true
  const around = source.slice(Math.max(0, start - 2), Math.min(source.length, end + 2))
  if (/\d[/-]\d/.test(around) || /\d[:：]\d/.test(around)) return true
  if (/點|分|月|日|時|时|min|am|pm/.test(around)) return true
  return false
}

const AMOUNT_CONTEXT_PATTERNS = [/花/, /付/, /付款/, /支出/, /收入/, /入帳/, /金額/, /轉/, /匯/, /借/, /還/, /买|買/, /付費/, /pay|paid|spend|spent|income|expense|amount|transfer|wire/i, /支払|入金|出金|振込|送金/]
const ADDON_CONTEXT_PATTERNS = [/附加項目/, /附加費/, /手續費/, /服務費/, /運費/, /稅金/, /稅費/, /折扣/, /優惠/, /回饋/, /減免/, /fee|shipping|tax|discount|rebate|cashback|coupon/i, /手数料|配送料|税金|割引|値引き/]

function collectAmountCandidates(text) {
  const candidates = []
  const amountPattern = /([+-]?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?)\s*(萬|w|千|k|百|元|塊|塊錢|円|yen|jpy|usd|dollar|dollars|bucks|twd|ntd|nt\$|\$|¥|￥)?/gi
  let matched = amountPattern.exec(text)
  while (matched) {
    const unitRaw = String(matched[2] ?? '')
    const hasUnit = Boolean(unitRaw)
    const amountMajor = parseAmountWithUnit(matched[1], unitRaw)
    if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
      matched = amountPattern.exec(text)
      continue
    }
    if (!hasUnit && (amountMajor < 0.01 || amountMajor > 9999999)) {
      matched = amountPattern.exec(text)
      continue
    }

    const start = matched.index
    const end = matched.index + String(matched[0] ?? '').length
    if (isLikelyDateOrTimeToken(text, start, end, hasUnit)) {
      matched = amountPattern.exec(text)
      continue
    }

    const leftContext = text.slice(Math.max(0, start - 10), start)
    const rightContext = text.slice(end, Math.min(text.length, end + 10))
    const context = `${leftContext} ${rightContext}`
    const nearAmountContext = includesAny(context, AMOUNT_CONTEXT_PATTERNS) ? 1 : 0
    const nearAddonContext = includesAny(context, ADDON_CONTEXT_PATTERNS) ? 1 : 0
    const hasBigUnit = /^(萬|w|千|k|百)$/i.test(unitRaw) ? 1 : 0

    const score = sigmoid(
      -0.7
      + (hasUnit ? 1.45 : 0)
      + hasBigUnit * 0.4
      + nearAmountContext * 0.45
      - nearAddonContext * 1.05,
    )

    candidates.push({
      text: String(matched[0] ?? '').trim(),
      start,
      end,
      amountMajor,
      score,
      unit: unitRaw,
      nearAddonContext: Boolean(nearAddonContext),
    })
    matched = amountPattern.exec(text)
  }

  if (!candidates.length) return []
  const maxAmount = Math.max(...candidates.map((item) => item.amountMajor))
  return candidates.map((candidate) => {
    const isLargest = candidate.amountMajor === maxAmount ? 1 : 0
    const reranked = sigmoid((candidate.score - 0.5) * 4 + isLargest * 0.35)
    return {
      ...candidate,
      score: reranked,
    }
  })
}

const FROM_ACCOUNT_PATTERNS = [/從/, /由/, /自/, /用/, /刷/, /扣/, /轉出/, /匯出/, /拨出/, /撥出/, /\bfrom\b/i, /\bvia\b/i, /\busing\b/i, /から|より/]
const TO_ACCOUNT_PATTERNS = [/到/, /至/, /給/, /轉入/, /匯入/, /存入/, /打到/, /撥入/, /拨入/, /\bto\b/i, /\binto\b/i, /\bdeposit to\b/i, /\bpay to\b/i, /へ/]
const TRANSFER_VERB_PATTERNS = [/轉/, /匯|汇/, /挪/, /撥|拨/, /移/, /搬/, /互轉|互转/, /\btransfer\b/i, /\bwire\b/i, /\bmove\b/i, /\bsend\b/i, /振込|送金|振替/]

function collectAccountCandidates(text, accounts) {
  const candidates = []
  for (const account of accounts ?? []) {
    const accountId = String(account?.id ?? '').trim()
    const accountName = String(account?.name ?? '').trim()
    if (!accountId || !accountName) continue
    const aliases = buildAccountAliases(accountName)
    for (const alias of aliases) {
      const positions = findAllPositions(text, alias)
      for (const start of positions) {
        const end = start + alias.length
        const left = text.slice(Math.max(0, start - 10), start)
        const right = text.slice(end, Math.min(text.length, end + 10))
        const context = `${left} ${right}`
        const hasFrom = includesAny(context, FROM_ACCOUNT_PATTERNS) ? 1 : 0
        const hasTo = includesAny(context, TO_ACCOUNT_PATTERNS) ? 1 : 0
        const hasTransferVerb = includesAny(context, TRANSFER_VERB_PATTERNS) ? 1 : 0
        const aliasCoverage = Math.min(alias.length, 10) / 10
        const isExactName = compactText(alias) === compactText(accountName) ? 1 : 0

        const accountScore = sigmoid(-0.9 + aliasCoverage * 1.45 + isExactName * 0.65 + hasTransferVerb * 0.3)
        const fromScore = sigmoid(-0.85 + aliasCoverage * 0.85 + hasFrom * 1.35 + hasTransferVerb * 0.45 - hasTo * 0.6)
        const toScore = sigmoid(-0.85 + aliasCoverage * 0.85 + hasTo * 1.35 + hasTransferVerb * 0.45 - hasFrom * 0.6)

        candidates.push({
          accountId,
          accountName,
          alias,
          start,
          end,
          score: accountScore,
          fromScore,
          toScore,
          hasFrom,
          hasTo,
        })
      }
    }
  }
  candidates.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    return b.score - a.score
  })
  return candidates
}

function pickBestByAccount(candidates, scoreKey) {
  const bestMap = new Map()
  for (const candidate of candidates) {
    const accountId = String(candidate?.accountId ?? '')
    if (!accountId) continue
    const score = Number(candidate?.[scoreKey] ?? 0)
    const current = bestMap.get(accountId)
    if (!current || score > Number(current?.[scoreKey] ?? 0)) {
      bestMap.set(accountId, candidate)
    }
  }
  return [...bestMap.values()].sort((a, b) => Number(b?.[scoreKey] ?? 0) - Number(a?.[scoreKey] ?? 0))
}

function buildAccountHints(accountCandidates) {
  const entities = []
  const bestGeneral = pickBestByAccount(accountCandidates, 'score')[0] ?? null
  const fromCandidates = pickBestByAccount(accountCandidates, 'fromScore')
  const toCandidates = pickBestByAccount(accountCandidates, 'toScore')
  const bestFrom = fromCandidates[0] ?? null
  let bestTo = toCandidates[0] ?? null

  if (bestFrom && bestTo && bestFrom.accountId === bestTo.accountId) {
    bestTo = toCandidates.find((candidate) => candidate.accountId !== bestFrom.accountId) ?? bestTo
  }

  if (bestGeneral) {
    entities.push(
      toEntity('ACCOUNT', bestGeneral.alias, bestGeneral.start, bestGeneral.end, bestGeneral.score, bestGeneral.accountId, {
        accountName: bestGeneral.accountName,
      }),
    )
  }
  if (bestFrom) {
    entities.push(
      toEntity('ACCOUNT_FROM', bestFrom.alias, bestFrom.start, bestFrom.end, bestFrom.fromScore, bestFrom.accountId, {
        accountName: bestFrom.accountName,
      }),
    )
  }
  if (bestTo) {
    entities.push(
      toEntity('ACCOUNT_TO', bestTo.alias, bestTo.start, bestTo.end, bestTo.toScore, bestTo.accountId, {
        accountName: bestTo.accountName,
      }),
    )
  }

  return {
    accountIdHint: String(bestGeneral?.accountId ?? ''),
    accountConfidence: clamp01(Number(bestGeneral?.score ?? 0)),
    fromAccountIdHint: String(bestFrom?.accountId ?? ''),
    fromAccountConfidence: clamp01(Number(bestFrom?.fromScore ?? 0)),
    toAccountIdHint: String(bestTo?.accountId ?? ''),
    toAccountConfidence: clamp01(Number(bestTo?.toScore ?? 0)),
    entities,
  }
}

const GENERIC_CATEGORY_NAME_RE = /^(其他|雜項|未分類|misc|other|その他)$/i

function collectCategoryCandidates(text, categories, type) {
  const candidates = []
  const contextPatterns = type === 'income'
    ? [/收入/, /薪水/, /薪資/, /獎金/, /利息/, /股息/, /退款/, /退費/, /入帳/, /收到/, /\bincome\b/i, /\bsalary\b/i, /\bbonus\b/i, /\brefund\b/i, /収入|給与|給料|返金|入金/]
    : [/花/, /買/, /付款/, /支出/, /餐/, /交通/, /房租/, /娛樂/, /醫療/, /學費/, /服飾/, /\bexpense\b/i, /\bspent\b/i, /\bpay\b/i, /\bmeal\b/i, /\btransport\b/i, /\brent\b/i, /支出|食費|交通費|家賃|医療/]

  for (const category of categories ?? []) {
    const categoryId = String(category?.id ?? '').trim()
    const categoryName = String(category?.name ?? '').trim()
    if (!categoryId || !categoryName) continue
    const positions = findAllPositions(text, categoryName)
    for (const start of positions) {
      const end = start + categoryName.length
      const around = text.slice(Math.max(0, start - 10), Math.min(text.length, end + 10))
      const hasContext = includesAny(around, contextPatterns) ? 1 : 0
      const isGeneric = GENERIC_CATEGORY_NAME_RE.test(categoryName) ? 1 : 0
      const lengthFactor = Math.min(categoryName.length, 8) / 8
      const score = sigmoid(-0.7 + lengthFactor * 1.1 + hasContext * 0.65 - isGeneric * 0.7)

      candidates.push({
        categoryId,
        categoryName,
        type,
        start,
        end,
        score,
      })
    }
  }
  candidates.sort((a, b) => Number(b?.score ?? 0) - Number(a?.score ?? 0))
  return candidates
}

function pickCategoryHint(candidates, label) {
  const best = candidates[0] ?? null
  if (!best) {
    return {
      categoryIdHint: '',
      confidence: 0,
      entity: null,
    }
  }
  return {
    categoryIdHint: best.categoryId,
    confidence: clamp01(Number(best.score ?? 0)),
    entity: toEntity(label, best.categoryName, best.start, best.end, best.score, best.categoryId, {
      categoryName: best.categoryName,
      type: best.type,
    }),
  }
}

const TYPE_TRANSFER_PATTERNS = [
  /轉帳|转账/,
  /轉出|转出/,
  /轉入|转入/,
  /轉給|转给/,
  /轉到|转到/,
  /匯款|汇款/,
  /匯入|汇入/,
  /匯出|汇出/,
  /撥款|拨款|調撥|调拨/,
  /挪款|挪錢|挪钱/,
  /搬錢|搬钱|搬款/,
  /移轉|過戶|过户/,
  /互轉|互转/,
  /\btransfer\b/i,
  /\bwire\b/i,
  /\bmove money\b/i,
  /\bsend money\b/i,
  /振込|送金|振替|口座間/,
]
const TYPE_INCOME_PATTERNS = [/收入/, /薪水/, /薪資/, /獎金/, /入帳/, /收到/, /退款/, /退費/, /回饋/, /\bincome\b/i, /\bsalary\b/i, /\bwage\b/i, /\bbonus\b/i, /\brefund\b/i, /収入|給料|給与|返金|入金/]
const TYPE_EXPENSE_PATTERNS = [/支出/, /花/, /買/, /付款/, /繳/, /費用/, /消費/, /扣款/, /\bexpense\b/i, /\bspent\b/i, /\bpay\b/i, /\bpurchase\b/i, /支出|出金|購入|支払い/]

function detectTypeHint(text, accountCandidates, categorySignals) {
  const transferHits = countPatternHits(text, TYPE_TRANSFER_PATTERNS)
  const incomeHits = countPatternHits(text, TYPE_INCOME_PATTERNS)
  const expenseHits = countPatternHits(text, TYPE_EXPENSE_PATTERNS)
  const distinctAccounts = new Set((accountCandidates ?? []).map((item) => String(item?.accountId ?? '')).filter(Boolean)).size
  const hasDirectional = includesAny(text, [/(從|由|自)\s*\S{0,16}\s*(到|至|給)/, /\bfrom\b\s+\S{0,20}\s+\bto\b/i, /から\s*\S{0,16}\s*へ/, /→|->|=>|➡/]) ? 1 : 0
  const expenseCategorySignal = Number(categorySignals?.expense ?? 0) >= 0.62 ? 1 : 0
  const incomeCategorySignal = Number(categorySignals?.income ?? 0) >= 0.62 ? 1 : 0

  const logits = {
    transfer: -1.1 + transferHits * 1.2 + hasDirectional * 0.9 + (distinctAccounts >= 2 ? 1.1 : 0),
    income: -0.45 + incomeHits * 1.1 + incomeCategorySignal * 0.8 - transferHits * 0.55,
    expense: -0.2 + expenseHits * 0.95 + expenseCategorySignal * 0.8 - transferHits * 0.35,
  }
  const probs = softmax(logits)
  const bestEntry = Object.entries(probs).sort((a, b) => Number(b[1]) - Number(a[1]))[0] ?? null
  if (!bestEntry) {
    return {
      typeHint: '',
      typeConfidence: 0,
      entity: null,
    }
  }

  const [typeHint, typeConfidence] = bestEntry
  const confidence = clamp01(Number(typeConfidence))
  const entity = toEntity(
    'TYPE',
    typeHint,
    0,
    Math.min(1, text.length),
    confidence,
    typeHint,
    {
      probs,
      transferHits,
      incomeHits,
      expenseHits,
      distinctAccounts,
    },
  )
  return {
    typeHint,
    typeConfidence: confidence,
    entity,
  }
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
  if (name.length > 24) {
    name = name.slice(0, 24).trim()
  }
  if (!name) return ''
  if (/^\d+(?:\.\d+)?$/.test(name)) return ''
  if (/^(昨天|今天|明天|前天|剛剛|刚刚|下午|上午|晚上|早上|yesterday|today|tomorrow|afternoon|morning|evening|night|昨日|今日|明日)$/i.test(name)) return ''
  return name
}

function extractCounterpartyHint(text) {
  const patterns = [
    /(?:借給|借了給|借出給|借款給|還給|还给)\s*([^\s，。,；;:：]{1,24})/i,
    /(?:向|跟)\s*([^\s，。,；;:：]{1,24})\s*(?:借|借款|借錢|借钱|還款|还款|還錢|还钱)/i,
    /([^\s，。,；;:：]{1,24})\s*(?:還我|还我)/i,
    /(?:lend(?:ing)?|loan(?:ed)?|borrow(?:ed)?|repay(?:ed)?|pay(?:ing)?\s+back)\s+(?:to|from)?\s*([a-zA-Z][a-zA-Z0-9._-]{0,23})/i,
    /([^\s，。,；;:：]{1,24})\s*(?:に|から)\s*(?:貸した|借りた|返済)/i,
  ]

  for (const pattern of patterns) {
    const matched = pattern.exec(text)
    if (!matched) continue
    const normalized = normalizeCounterpartyName(matched[1])
    if (!normalized) continue
    const start = matched.index + String(matched[0]).indexOf(String(matched[1]))
    const end = start + normalized.length
    const around = text.slice(Math.max(0, start - 8), Math.min(text.length, end + 8))
    const hasLoanContext = includesAny(around, [/借/, /還|还/, /欠/, /款/, /loan|lend|borrow|repay|pay back/i, /貸|借|返済/]) ? 1 : 0
    const score = sigmoid(-0.55 + hasLoanContext * 1.1 + Math.min(normalized.length, 8) * 0.06)
    return {
      name: normalized,
      confidence: clamp01(score),
      entity: toEntity('COUNTERPARTY', normalized, start, end, score, normalized),
    }
  }

  return {
    name: '',
    confidence: 0,
    entity: null,
  }
}

function pickAmountHint(amountCandidates) {
  const sorted = [...(amountCandidates ?? [])].sort((a, b) => {
    if (Number(b?.score ?? 0) !== Number(a?.score ?? 0)) return Number(b?.score ?? 0) - Number(a?.score ?? 0)
    return Number(b?.amountMajor ?? 0) - Number(a?.amountMajor ?? 0)
  })
  const top = sorted[0] ?? null
  if (!top) {
    return {
      amountMajor: NaN,
      confidence: 0,
      entity: null,
    }
  }
  return {
    amountMajor: top.amountMajor,
    confidence: clamp01(Number(top.score ?? 0)),
    entity: toEntity('AMOUNT', top.text, top.start, top.end, top.score, top.amountMajor, {
      amountMajor: top.amountMajor,
      unit: top.unit,
    }),
  }
}

export function extractTinyNerHints(input, context = {}) {
  const text = normalizeText(input)
  if (!text) {
    return {
      entities: [],
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
  }

  const accounts = context.accounts ?? []
  const expenseCategories = context.expenseCategories ?? []
  const incomeCategories = context.incomeCategories ?? []

  const amountCandidates = collectAmountCandidates(text)
  const amountHint = pickAmountHint(amountCandidates)
  const accountCandidates = collectAccountCandidates(text, accounts)
  const accountHints = buildAccountHints(accountCandidates)
  const expenseCategoryHint = pickCategoryHint(
    collectCategoryCandidates(text, expenseCategories, 'expense'),
    'CATEGORY_EXPENSE',
  )
  const incomeCategoryHint = pickCategoryHint(
    collectCategoryCandidates(text, incomeCategories, 'income'),
    'CATEGORY_INCOME',
  )
  const typeHint = detectTypeHint(text, accountCandidates, {
    expense: expenseCategoryHint.confidence,
    income: incomeCategoryHint.confidence,
  })
  const counterpartyHint = extractCounterpartyHint(text)

  const entities = [
    amountHint.entity,
    ...accountHints.entities,
    expenseCategoryHint.entity,
    incomeCategoryHint.entity,
    typeHint.entity,
    counterpartyHint.entity,
  ]
    .filter(Boolean)
    .sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start
      return Number(b.score) - Number(a.score)
    })

  return {
    entities,
    typeHint: typeHint.typeHint,
    typeConfidence: typeHint.typeConfidence,
    amountMajor: amountHint.amountMajor,
    amountConfidence: amountHint.confidence,
    accountIdHint: accountHints.accountIdHint,
    accountConfidence: accountHints.accountConfidence,
    fromAccountIdHint: accountHints.fromAccountIdHint,
    fromAccountConfidence: accountHints.fromAccountConfidence,
    toAccountIdHint: accountHints.toAccountIdHint,
    toAccountConfidence: accountHints.toAccountConfidence,
    expenseCategoryIdHint: expenseCategoryHint.categoryIdHint,
    expenseCategoryConfidence: expenseCategoryHint.confidence,
    incomeCategoryIdHint: incomeCategoryHint.categoryIdHint,
    incomeCategoryConfidence: incomeCategoryHint.confidence,
    counterpartyNameHint: counterpartyHint.name,
    counterpartyConfidence: counterpartyHint.confidence,
  }
}
