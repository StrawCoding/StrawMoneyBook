import { extractTinyNerHints } from './ai-bookkeeping-tiny-ner.service.js'
import { pickBestCategoryTextMatch } from './ai-bookkeeping-category-match.js'
import { normalizeLoanCounterpartyName } from './loan-counterparty-name.js'
import {
  compactText as compactTextValue,
  escapeRegExp as escapeRegExpValue,
  includesAny as includesAnyValue,
  isBareTypeOnlyInput as isBareTypeOnlyInputValue,
  normalizeText as normalizeTextValue,
  parseAmountMajor as parseAmountMajorValue,
  parseDateTimeFromText as parseDateTimeFromTextValue,
  parseSignedAmountMajor as parseSignedAmountMajorValue,
  round2 as round2Value,
  toMinor as toMinorValue,
} from './ai-bookkeeping-text.js'
import {
  findAccountMatchEntries as findAccountMatchEntriesValue,
  pickClosestAccount as pickClosestAccountValue,
  pickTransferAccounts as pickTransferAccountsValue,
  shouldTreatAsTransfer as shouldTreatAsTransferValue,
} from './ai-bookkeeping-account-match.js'
import {
  extractAddonItems as extractAddonItemsValue,
  extractSmartNoteText as extractSmartNoteTextValue,
  mergeUniqueAddonItems as mergeUniqueAddonItemsValue,
  parseAddonItemsFromStoredNote as parseAddonItemsFromStoredNoteValue,
  stripAddonSummaryFromStoredNote as stripAddonSummaryFromStoredNoteValue,
} from './ai-bookkeeping-note.js'
import {
  normalizeAutoFillRule as normalizeAutoFillRuleValue,
  pickCategoryByHistoryLearning as pickCategoryByHistoryLearningValue,
  pickMatchedAutoFillRule as pickMatchedAutoFillRuleValue,
  pickRecentAccountByCategory as pickRecentAccountByCategoryValue,
  pickRecentHistoryAutoFill as pickRecentHistoryAutoFillValue,
} from './ai-bookkeeping-history.js'

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
  return normalizeTextValue(value)
}

function compactText(value) {
  return compactTextValue(value)
}

function isBareTypeOnlyInput(text, type) {
  return isBareTypeOnlyInputValue(text, type)
}

function toMinor(major) {
  return toMinorValue(major)
}

function round2(value) {
  return round2Value(value)
}

function stripAddonSummaryFromStoredNote(note) {
  return stripAddonSummaryFromStoredNoteValue(note)
}

function parseAddonItemsFromStoredNote(note) {
  return parseAddonItemsFromStoredNoteValue(note)
}

function includesAny(text, patterns) {
  return includesAnyValue(text, patterns)
}

function escapeRegExp(value) {
  return escapeRegExpValue(value)
}

function parseDateTimeFromText(text, now = new Date()) {
  return parseDateTimeFromTextValue(text, now)
}

function parseAmountMajor(text) {
  return parseAmountMajorValue(text)
}

function parseSignedAmountMajor(text) {
  return parseSignedAmountMajorValue(text)
}

function extractAddonItems(text) {
  return extractAddonItemsValue(text)
}

function findAccountMatchEntries(text, accounts) {
  return findAccountMatchEntriesValue(text, accounts)
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
  return pickClosestAccountValue(text, accounts)
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
  return pickTransferAccountsValue(text, accounts)
}

function pickCategoryMatch(text, categories) {
  return pickBestCategoryTextMatch(text, categories)?.category ?? null
}

function normalizeAutoFillRule(raw) {
  return normalizeAutoFillRuleValue(raw)
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
  return pickMatchedAutoFillRuleValue(text, rules)
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
  return pickRecentAccountByCategoryValue(historyTransactions, accounts, targetType, categoryId)
}

function pickRecentHistoryAutoFill(text, historyTransactions, now = new Date()) {
  return pickRecentHistoryAutoFillValue(text, historyTransactions, now)
}

function pickCategoryByHistoryLearning(text, categories, historyTransactions, targetType, now = new Date()) {
  return pickCategoryByHistoryLearningValue(text, categories, historyTransactions, targetType, now)
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
  return mergeUniqueAddonItemsValue(baseItems, extraItems)
}

function extractSmartNoteText(text, context = {}) {
  return extractSmartNoteTextValue(text, context)
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
      /結餘/,
      /餘額調整|余额调整/,
      /對帳調整|对账调整/,
      /校正/,
      /盤點調整|盘点调整/,
      /\bbalance adjustment\b/i,
      /\badjustment\b/i,
      /\breconcile\b/i,
    ])
  ) {
    return 'adjustment'
  }
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

function pickKnownCounterpartyName(text, counterparties = []) {
  const source = String(text ?? '')
  const compactSource = compactText(source)
  if (!compactSource) return ''

  const candidates = Array.from(
    new Set(
      (counterparties ?? [])
        .map((item) => normalizeLoanCounterpartyName(item))
        .filter(Boolean),
    ),
  ).sort((a, b) => b.length - a.length)

  for (const candidate of candidates) {
    const compactCandidate = compactText(candidate)
    if (!compactCandidate || compactCandidate.length < 2) continue
    if (compactSource.includes(compactCandidate)) return candidate
  }

  return ''
}

function extractCounterpartyFromLoanText(text, mode, direction) {
  const source = String(text ?? '')
  const patterns = []

  if (mode === 'create' && direction === 'lend') {
    patterns.push(
      /(?:借出|借了)\s*(?:nt\$?|ntd|twd|us\$|usd|\$|¥)?\s*\d[\d,]*(?:\.\d+)?(?:k|w|萬|万|千|百|元(?:整)?|塊|块|美元|美金|台幣|臺幣|日圓|日元)?\s*(?:給|借給)\s*([^\d\s，。,；;:：][^\s，。,；;:：]{0,23})/i,
      /(?:借給|借了給|借出給|借款給)\s*([^\d\s，。,；;:：][^\s，。,；;:：]{0,23})/i,
      /給\s*([^\d\s，。,；;:：][^\s，。,；;:：]{0,23})\s*(?:借|借款|借錢|借钱|借出)/i,
      /(?:lend(?:ing)?|loan(?:ed)?)\s+to\s+([a-zA-Z][a-zA-Z0-9._-]{0,23})/i,
      /([a-zA-Z][a-zA-Z0-9._-]{0,23})\s+(?:borrowed)\s+from\s+me/i,
      /([^\d\s，。,；;:：][^\s，。,；;:：]{0,23})\s*に\s*貸した/i,
    )
  } else if (mode === 'create' && direction === 'borrow') {
    patterns.push(
      /(?:向|跟)\s*([^\d\s，。,；;:：][^\s，。,；;:：]{0,23})\s*(?:借|借了|借入|借款|借錢|借钱)/i,
      /(?:向|跟)\s*([^\d\s，。,；;:：][^\s，。,；;:：]{0,23})\s*(?:拿|借)(?:了)?\s*(?:(?:nt\$?|ntd|twd|us\$|usd|\$|¥)\s*)?\d[\d,]*(?:\.\d+)?/i,
      /(?:borrow(?:ed)?|loan)\s+from\s+([a-zA-Z][a-zA-Z0-9._-]{0,23})/i,
      /([^\d\s，。,；;:：][^\s，。,；;:：]{0,23})\s*から\s*借(?:りた|入れた)?/i,
    )
  } else if (mode === 'repay' && direction === 'lend') {
    patterns.push(
      /(?:收回|收到|收到了)\s*([^\d\s，。,；;:：][^\s，。,；;:：]{0,23})/i,
      /(?:收到|收到了)\s*([^\d\s，。,；;:：][^\s，。,；;:：]{0,23})\s*(?:還款|还款|還錢|还钱)\s*(?:(?:nt\$?|ntd|twd|us\$|usd|\$|¥)\s*)?\d[\d,]*(?:\.\d+)?/i,
      /([^\d\s，。,；;:：][^\s，。,；;:：]{0,23})\s*(?:還我|还我)/i,
      /(?:received|got)\s+(?:repayment|payback)\s+from\s+([a-zA-Z][a-zA-Z0-9._-]{0,23})/i,
      /([^\d\s，。,；;:：][^\s，。,；;:：]{0,23})\s*が\s*返済した/i,
    )
  } else if (mode === 'repay' && direction === 'borrow') {
    patterns.push(
      /(?:還給|还给)\s*([^\d\s，。,；;:：][^\s，。,；;:：]{0,23})/i,
      /(?:向|跟)\s*([^\d\s，。,；;:：][^\s，。,；;:：]{0,23})\s*(?:歸還|归还|還款|还款|還錢|还钱)/i,
      /(?:repay(?:ed)?|pay(?:ing)?\s+back)\s+([a-zA-Z][a-zA-Z0-9._-]{0,23})/i,
      /([^\d\s，。,；;:：][^\s，。,；;:：]{0,23})\s*に\s*返済した/i,
    )
  }

  for (const pattern of patterns) {
    const matched = pattern.exec(source)
    if (!matched) continue
    const normalized = normalizeLoanCounterpartyName(matched[1])
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
  return shouldTreatAsTransferValue(text, accounts)
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

  const earlyBareType = ['expense', 'income', 'adjustment', 'transfer']
    .find((type) => isBareTypeOnlyInput(text, type)) ?? ''
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
  const counterparties = context.counterparties ?? []
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
  if (loanIntent && !loanIntent.counterpartyName) {
    const knownCounterpartyName = pickKnownCounterpartyName(text, counterparties)
    if (knownCounterpartyName) {
      loanIntent = {
        ...loanIntent,
        counterpartyName: knownCounterpartyName,
      }
    }
  }
  if (loanIntent) {
    loanIntent = {
      ...loanIntent,
      counterpartyName: normalizeLoanCounterpartyName(loanIntent.counterpartyName),
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
  } else if (inferredType === 'adjustment') {
    amountMajor = parseSignedAmountMajor(parsedAddon.items.length > 0 ? parsedAddon.strippedText : text)
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
    if (type !== 'adjustment') {
      if (hasExpenseSignal && !hasIncomeSignal) type = 'expense'
      if (hasIncomeSignal && !hasExpenseSignal) type = 'income'
    }
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
  if (type !== 'transfer' && type !== 'adjustment' && !loanIntent) {
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

  let includeInBudget = type === 'transfer' || type === 'adjustment' ? false : !isReimbursable
  let includeInAnalysis = type === 'transfer' || type === 'adjustment' ? false : !isReimbursable
  includeInBudget = normalizeIncludeFlag(text, 'budget', includeInBudget)
  includeInAnalysis = normalizeIncludeFlag(text, 'analysis', includeInAnalysis)

  const noteCategories = loanIntent || type === 'adjustment'
    ? []
    : type === 'income'
      ? incomeCategories
      : expenseCategories
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
