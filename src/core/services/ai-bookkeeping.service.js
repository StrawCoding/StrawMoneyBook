function normalizeText(value) {
  return String(value ?? '')
    .replace(/[，、]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactText(value) {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function toMinor(major) {
  return Math.round(Number(major) * 100)
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text))
}

function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseDateTimeFromText(text, now = new Date()) {
  const base = new Date(now)
  base.setSeconds(0, 0)

  if (/前天/.test(text)) {
    base.setDate(base.getDate() - 2)
  } else if (/昨天/.test(text)) {
    base.setDate(base.getDate() - 1)
  } else if (/明天/.test(text)) {
    base.setDate(base.getDate() + 1)
  }

  const ymd = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (ymd) {
    const year = Number(ymd[1])
    const month = Number(ymd[2]) - 1
    const day = Number(ymd[3])
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      base.setFullYear(year, month, day)
    }
  } else {
    const md = text.match(/(\d{1,2})[/-](\d{1,2})/)
    if (md) {
      const month = Number(md[1]) - 1
      const day = Number(md[2])
      if (Number.isFinite(month) && Number.isFinite(day)) {
        base.setMonth(month, day)
      }
    }
  }

  const hm = text.match(/([01]?\d|2[0-3])[:：]([0-5]\d)/)
  if (hm) {
    base.setHours(Number(hm[1]), Number(hm[2]), 0, 0)
    return base.toISOString()
  }

  const hourOnly = text.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})\s*點(?:\s*(\d{1,2})\s*分)?/)
  if (hourOnly) {
    let hour = Number(hourOnly[2])
    const minute = Number(hourOnly[3] ?? 0)
    const period = String(hourOnly[1] ?? '')
    if ((period === '下午' || period === '晚上') && hour < 12) {
      hour += 12
    }
    if (period === '中午' && hour < 11) {
      hour += 12
    }
    if (period === '凌晨' && hour === 12) {
      hour = 0
    }
    if (Number.isFinite(hour) && Number.isFinite(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      base.setHours(hour, minute, 0, 0)
    }
  }

  return base.toISOString()
}

function parseAmountMajor(text) {
  const withUnit = [...text.matchAll(/([+-]?\d+(?:\.\d+)?)\s*(萬|w|千|k|百|元|塊|塊錢|twd|ntd|\$)/gi)]
  if (withUnit.length > 0) {
    const target = withUnit[withUnit.length - 1]
    const raw = Number(target[1])
    const unit = String(target[2] ?? '').toLowerCase()
    if (Number.isFinite(raw)) {
      if (unit === '萬' || unit === 'w') return Math.abs(round2(raw * 10000))
      if (unit === '千' || unit === 'k') return Math.abs(round2(raw * 1000))
      if (unit === '百') return Math.abs(round2(raw * 100))
      return Math.abs(round2(raw))
    }
  }

  const allNumbers = [...text.matchAll(/([+-]?\d+(?:\.\d+)?)/g)]
    .map((item) => Number(item[1]))
    .filter((item) => Number.isFinite(item) && Math.abs(item) > 0)
    .map((item) => Math.abs(item))

  if (!allNumbers.length) return NaN

  const year = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)?.[1]
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
  const amount = Math.abs(Number(rawAmount))
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
      regex: /(附加項目|附加費|手續費|服務費|運費|稅金|稅費|匯費|利息|加價|加收)\s*([+-]?)\s*(\d+(?:\.\d+)?)\s*(萬|w|千|k|百|元|塊|塊錢|twd|ntd|\$)?/gi,
    },
    {
      defaultDirection: 'minus',
      regex: /(折扣|優惠|回饋|減免|折讓)\s*([+-]?)\s*(\d+(?:\.\d+)?)\s*(萬|w|千|k|百|元|塊|塊錢|twd|ntd|\$)?/gi,
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

function findAccountMatches(text, accounts) {
  const compact = compactText(text)
  const matches = []

  for (const account of accounts ?? []) {
    const name = String(account?.name ?? '').trim()
    if (!name) continue
    const target = compactText(name)
    const index = compact.indexOf(target)
    if (index < 0) continue
    matches.push({ account, index, score: target.length })
  }

  matches.sort((a, b) => {
    if (a.index !== b.index) return a.index - b.index
    return b.score - a.score
  })

  return matches.map((item) => item.account)
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

  let best = null
  for (const account of accounts ?? []) {
    const name = String(account?.name ?? '').trim()
    if (!name) continue
    const score = fuzzyAccountScore(compact, compactText(name))
    if (!best || score > best.score) {
      best = { account, score }
    }
  }

  if (!best || best.score < 90) return null
  return best.account
}

function findAccountByKeyword(text, accounts, keywords) {
  for (const keyword of keywords) {
    const keywordIndex = text.indexOf(keyword)
    const textAfterKeyword = keywordIndex >= 0 ? text.slice(keywordIndex + keyword.length) : ''

    for (const account of accounts ?? []) {
      const name = String(account?.name ?? '').trim()
      if (!name) continue
      const keywordPattern = new RegExp(`${escapeRegExp(keyword)}\\s*${escapeRegExp(name)}`)
      if (keywordPattern.test(text)) return account
    }

    const fuzzy = pickClosestAccount(textAfterKeyword, accounts)
    if (fuzzy) return fuzzy
  }
  return null
}

function pickTransferAccounts(text, accounts) {
  const matched = findAccountMatches(text, accounts)

  const fromByKeyword = findAccountByKeyword(text, accounts, ['從', '由', '自', '用', '刷', '扣'])
  const toByKeyword = findAccountByKeyword(text, accounts, ['到', '至', '給', '轉入', '匯入'])

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

const EXPENSE_CATEGORY_SEMANTIC_RULES = [
  { triggers: [/早餐|午餐|晚餐|宵夜|便當|餐廳|咖啡|飲料|手搖|點心|foodpanda|ubereats|uber eats/i], hints: ['早餐', '午餐', '晚餐', '餐飲', '飲食', '餐費', '便當', '餐', '食', '飲', '伙食', '咖啡', 'food', 'meal'] },
  { triggers: [/捷運|高鐵|台鐵|公車|計程車|uber|停車|加油|車票|交通/i], hints: ['交通', '運輸', '通勤', '停車', '油'] },
  { triggers: [/房租|租金|管理費|水費|電費|瓦斯|網路費|電話費|電信/i], hints: ['居家', '家用', '房租', '水電', '電信', '網路', '租'] },
  { triggers: [/看病|門診|藥|醫院|診所|牙醫|健保|醫療/i], hints: ['醫療', '健康', '藥', '保健'] },
  { triggers: [/電影|演唱會|旅遊|住宿|飯店|遊戲|娛樂|ktv|netflix|spotify/i], hints: ['娛樂', '休閒', '旅遊', '玩樂'] },
  { triggers: [/課程|學費|書|教材|補習|訓練|證照/i], hints: ['學習', '教育', '進修', '書'] },
  { triggers: [/衣服|褲子|鞋|包包|服飾|化妝品|保養品/i], hints: ['服飾', '穿搭', '美妝', '購物'] },
]

const INCOME_CATEGORY_SEMANTIC_RULES = [
  { triggers: [/薪水|薪資|月薪|年終|獎金|津貼|加班費/i], hints: ['薪', '薪資', '薪水', '工作', '收入'] },
  { triggers: [/利息|股息|配息|投資|分紅|回饋金/i], hints: ['投資', '利息', '股', '配息', '被動'] },
  { triggers: [/退款|退費|退稅|退貨/i], hints: ['退款', '退費', '退稅', '其他收入'] },
  { triggers: [/接案|佣金|手續費收入|兼職|外快/i], hints: ['接案', '兼職', '副業', '佣金', '收入'] },
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

function pickFirstNonGenericCategory(categories) {
  for (const item of categories ?? []) {
    if (!item?.id) continue
    if (!isGenericCategoryName(item.name)) return item
  }
  return categories?.[0] ?? null
}

function extractSmartNoteText(text, context = {}) {
  let note = String(text ?? '')
  const accountNames = (context.accounts ?? [])
    .map((item) => String(item?.name ?? '').trim())
    .filter(Boolean)
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

  const stripPatterns = [
    /\d{4}[/-]\d{1,2}[/-]\d{1,2}/g,
    /\d{1,2}[/-]\d{1,2}/g,
    /([01]?\d|2[0-3])[:：]([0-5]\d)/g,
    /(凌晨|早上|上午|中午|下午|晚上)?\s*\d{1,2}\s*點(?:\s*\d{1,2}\s*分)?/g,
    /[+-]?\d+(?:\.\d+)?\s*(萬|w|千|k|百|元|塊|塊錢|twd|ntd|\$)/gi,
    /[+-]?\d+(?:\.\d+)?/g,
    /(昨天|今天|明天|前天|剛剛|剛才|方才|剛)/g,
    /(刷卡|現金|轉帳|匯款|付款|支付|扣款|入帳|報[銷修]|報帳|請款|紀錄|記帳|新增|幫我|請幫我)/g,
    /(收入|支出|轉出|轉入)/g,
    /(計入預算|不計入預算|計入收支|不計入收支|算進預算|算進分析)/g,
    /(早餐|午餐|晚餐|宵夜|餐費|餐飲|伙食|飲料|咖啡|交通|車資|通勤|捷運|地鐵|公車|客運|高鐵|台鐵|火車|計程車|uber|油錢|停車費|房租|租金|水費|電費|瓦斯|網路費|電信費|醫療|藥費|娛樂|旅遊|學費|教材|服飾|美妝|薪水|薪資|獎金|利息|股息|退款|退費)/gi,
    /(錢包|信用卡|簽帳卡|金融卡|帳戶)/g,
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

function normalizeType(text) {
  if (includesAny(text, [/轉帳/, /轉入/, /轉出/, /轉到/, /匯款/, /匯入/, /匯出/])) return 'transfer'
  if (includesAny(text, [/收入/, /薪水/, /薪資/, /獎金/, /入帳/, /收到/, /退款/, /退費/, /回饋/])) return 'income'
  return 'expense'
}

function shouldTreatAsTransfer(text, accounts) {
  const uniqueMatchedAccountIds = [...new Set(findAccountMatches(text, accounts).map((item) => item.id).filter(Boolean))]
  if (uniqueMatchedAccountIds.length < 2) return false

  const hasDirectionalPhrase = includesAny(text, [
    /(從|由|自)\s*\S{0,12}\s*(到|至|給)/,
    /(由)\s*\S{0,12}\s*(轉給|轉到|匯給|匯到)/,
  ])
  const hasTransferAction = includesAny(text, [
    /轉給/,
    /轉去/,
    /轉到/,
    /匯給/,
    /匯到/,
    /轉來/,
    /挪到/,
    /挪去/,
  ])

  return hasDirectionalPhrase || hasTransferAction
}

function normalizeReimbursable(text, fallback = false) {
  if (includesAny(text, [/不報[銷修]/, /不可報[銷修]/, /不需報[銷修]/, /不用報[銷修]/, /自費/])) return false
  if (includesAny(text, [/可報[銷修]/, /可報帳/, /報[銷修]/, /報帳/, /請款/, /墊付/])) return true
  return fallback
}

function normalizeIncludeFlag(text, key, fallback) {
  if (key === 'budget') {
    if (includesAny(text, [/不計入預算/, /不算預算/, /不記預算/, /不列預算/, /不走預算/, /預算外/])) return false
    if (includesAny(text, [/計入預算/, /算進預算/, /記入預算/, /納入預算/, /列入預算/])) return true
    return fallback
  }

  if (includesAny(text, [/不計入收支/, /不計收支/, /不記收支/, /不計入分析/, /不算分析/, /收支外/, /分析外/])) return false
  if (includesAny(text, [/計入收支/, /記錄收支/, /計入分析/, /算進分析/, /列入收支/, /列入分析/])) return true
  return fallback
}

export function parseAutoBookkeepingText(input, context = {}) {
  const text = normalizeText(input)
  if (!text) {
    return {
      draft: null,
      warnings: ['請輸入要解析的內容'],
    }
  }

  const accounts = context.accounts ?? []
  const expenseCategories = context.expenseCategories ?? []
  const incomeCategories = context.incomeCategories ?? []
  const warnings = []
  const rawType = normalizeType(text)
  const inferredType = rawType === 'transfer' || shouldTreatAsTransfer(text, accounts) ? 'transfer' : rawType
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

  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    warnings.push('找不到有效金額，請手動輸入')
  }

  const occurredAt = parseDateTimeFromText(text, context.now ?? new Date())

  const matchedExpenseCategory = pickCategoryMatch(text, expenseCategories)
  const matchedIncomeCategory = pickCategoryMatch(text, incomeCategories)
  const semanticExpenseCategory = pickCategoryBySemanticRules(text, expenseCategories, EXPENSE_CATEGORY_SEMANTIC_RULES)
  const semanticIncomeCategory = pickCategoryBySemanticRules(text, incomeCategories, INCOME_CATEGORY_SEMANTIC_RULES)

  let type = inferredType
  if (type !== 'transfer') {
    const hasExpenseSignal = Boolean(matchedExpenseCategory || semanticExpenseCategory)
    const hasIncomeSignal = Boolean(matchedIncomeCategory || semanticIncomeCategory)
    if (hasExpenseSignal && !hasIncomeSignal) type = 'expense'
    if (hasIncomeSignal && !hasExpenseSignal) type = 'income'
  }

  let accountId = ''
  let peerAccountId = ''
  if (type === 'transfer') {
    const transferAccounts = pickTransferAccounts(text, accounts)
    accountId = transferAccounts.fromAccountId || accounts[0]?.id || ''
    peerAccountId = transferAccounts.toAccountId || accounts.find((item) => item.id !== accountId)?.id || ''

    if (!accountId || !peerAccountId || accountId === peerAccountId) {
      warnings.push('轉帳帳戶不足，請手動選擇轉出/轉入帳戶')
    }
  } else {
    accountId = pickClosestAccount(text, accounts)?.id ?? accounts[0]?.id ?? ''
    if (!accountId) {
      warnings.push('找不到可用帳戶，請先建立帳戶')
    }
  }

  let categoryId = ''
  let selectedCategoryName = ''
  if (type !== 'transfer') {
    if (type === 'income') {
      const selectedIncomeCategory =
        semanticIncomeCategory ??
        matchedIncomeCategory ??
        pickFirstNonGenericCategory(incomeCategories) ??
        null
      categoryId = selectedIncomeCategory?.id ?? ''
      selectedCategoryName = String(selectedIncomeCategory?.name ?? '')
    } else {
      const selectedExpenseCategory =
        semanticExpenseCategory ??
        matchedExpenseCategory ??
        pickFirstNonGenericCategory(expenseCategories) ??
        null
      categoryId = selectedExpenseCategory?.id ?? ''
      selectedCategoryName = String(selectedExpenseCategory?.name ?? '')
    }

    if (!categoryId) {
      warnings.push('找不到可用分類，請先建立分類')
    }
  }

  const isReimbursable = type === 'expense' ? normalizeReimbursable(text, false) : false

  let includeInBudget = type === 'transfer' ? false : !isReimbursable
  let includeInAnalysis = type === 'transfer' ? false : !isReimbursable
  includeInBudget = normalizeIncludeFlag(text, 'budget', includeInBudget)
  includeInAnalysis = normalizeIncludeFlag(text, 'analysis', includeInAnalysis)

  const autoNote = extractSmartNoteText(text, {
    accounts,
    selectedCategoryName,
    categories: type === 'income' ? incomeCategories : expenseCategories,
  })
  const noteText = autoNote

  const draft = {
    sourceText: text,
    type,
    amountMajor: Number.isFinite(amountMajor) ? amountMajor : 0,
    occurredAt,
    accountId,
    peerAccountId,
    categoryId,
    note: noteText,
    addonItems: parsedAddon.items,
    isReimbursable,
    includeInBudget,
    includeInAnalysis,
  }

  return {
    draft: {
      ...draft,
      amountMinor: toMinor(draft.amountMajor),
    },
    warnings,
  }
}
