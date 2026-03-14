import {
  AI_BOOKKEEPING_WARNING_KEY,
  getAiBookkeepingWarningFallback,
  parseAutoBookkeepingText,
} from './ai-bookkeeping-parser.js'
import { detectSpeechAddonExpectation, normalizeTaiwaneseSpeechText } from './tw-normalization.js'

const INTENT_RULES = Object.freeze({
  newCategory: [/新增.*分類/, /建立.*分類/, /加.*分類/, /add category/i, /new category/i],
  queryAnalysis: [/查詢/, /分析/, /統計/, /報表/, /這個月.*(花|支出|收入)/, /本月.*(花|支出|收入)/, /上月.*(花|支出|收入)/],
})

const MAX_CONTEXT_ITEMS = 120

function toSafeString(value, maxLength = 120) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function toSafeBoolean(value) {
  return Boolean(value)
}

function toSafeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function limitArray(list, mapper, limit = MAX_CONTEXT_ITEMS) {
  if (!Array.isArray(list)) return []
  return list.slice(0, limit).map((item) => mapper(item)).filter(Boolean)
}

function sanitizeSpeechParserContext(context = {}) {
  const nowValue = context?.now ? new Date(context.now) : new Date()
  const now = Number.isNaN(nowValue.getTime()) ? new Date() : nowValue

  return {
    now,
    locale: toSafeString(context?.locale, 24),
    timezone: toSafeString(context?.timezone, 64),
    accounts: limitArray(context?.accounts, (account) => {
      const id = toSafeString(account?.id, 64)
      const name = toSafeString(account?.name)
      if (!id || !name) return null
      return {
        id,
        name,
        groupName: toSafeString(account?.groupName),
        currency_code: toSafeString(account?.currency_code, 12),
        type: toSafeString(account?.type, 24),
      }
    }),
    expenseCategories: limitArray(context?.expenseCategories, (category) => {
      const id = toSafeString(category?.id, 64)
      const name = toSafeString(category?.name)
      if (!id || !name) return null
      return { id, name }
    }),
    incomeCategories: limitArray(context?.incomeCategories, (category) => {
      const id = toSafeString(category?.id, 64)
      const name = toSafeString(category?.name)
      if (!id || !name) return null
      return { id, name }
    }),
    counterparties: limitArray(context?.counterparties, (name) => {
      const normalized = toSafeString(name)
      return normalized || null
    }, 60),
    historyTransactions: limitArray(context?.historyTransactions, (item) => {
      const type = toSafeString(item?.type, 24)
      const occurredAt = toSafeString(item?.occurredAt ?? item?.occurred_at, 40)
      return {
        id: toSafeString(item?.id, 64),
        type,
        occurredAt,
        note: toSafeString(item?.note, 240),
        accountId: toSafeString(item?.accountId ?? item?.account_id, 64),
        peerAccountId: toSafeString(item?.peerAccountId ?? item?.peer_account_id, 64),
        categoryId: toSafeString(item?.categoryId ?? item?.category_id, 64),
        amountMinor: Math.round(toSafeNumber(item?.amountMinor ?? item?.amount_minor, 0)),
        includeInBudget: toSafeBoolean(item?.includeInBudget ?? item?.include_in_budget),
        includeInAnalysis: toSafeBoolean(item?.includeInAnalysis ?? item?.include_in_analysis),
        isReimbursable: toSafeBoolean(item?.isReimbursable ?? item?.is_reimbursable),
      }
    }, 80),
    autoFillRules: limitArray(context?.autoFillRules, (rule) => {
      const keyword = toSafeString(rule?.keyword)
      if (!keyword) return null
      return {
        id: toSafeString(rule?.id, 64),
        keyword,
        type: toSafeString(rule?.type, 24),
        accountId: toSafeString(rule?.accountId, 64),
        peerAccountId: toSafeString(rule?.peerAccountId, 64),
        categoryId: toSafeString(rule?.categoryId, 64),
        note: toSafeString(rule?.note, 240),
        amountMajor: toSafeNumber(rule?.amountMajor, null),
        isReimbursable: toSafeBoolean(rule?.isReimbursable),
        addonItems: limitArray(rule?.addonItems, (item) => {
          const label = toSafeString(item?.label)
          if (!label) return null
          return {
            label,
            deltaMajor: toSafeNumber(item?.deltaMajor ?? item?.amountMajor, 0),
          }
        }, 12),
      }
    }, 40),
    addonTemplates: limitArray(context?.addonTemplates, (item) => {
      const id = toSafeString(item?.id, 64)
      const label = toSafeString(item?.label)
      if (!id || !label) return null
      return {
        id,
        label,
        defaultDirection: toSafeString(item?.defaultDirection, 8) === 'minus' ? 'minus' : 'plus',
      }
    }, 40),
  }
}

function inferActionType(sourceText, draft) {
  const text = String(sourceText ?? '')
  if (INTENT_RULES.newCategory.some((pattern) => pattern.test(text))) return 'new_category'
  if (INTENT_RULES.queryAnalysis.some((pattern) => pattern.test(text))) return 'query_analysis'
  if (draft?.loanIntent?.mode === 'create' && draft?.loanIntent?.direction === 'borrow') return 'borrow'
  if (draft?.loanIntent?.mode === 'create' && draft?.loanIntent?.direction === 'lend') return 'lend'
  if (draft?.loanIntent?.mode === 'repay') {
    return draft?.loanIntent?.direction === 'borrow' ? 'borrow' : 'lend'
  }
  if (draft?.isReimbursable && draft?.type === 'expense') return 'reimbursement'
  if (draft?.type === 'transfer') return 'transfer'
  if (draft?.type === 'income') return 'income'
  if (draft?.type === 'expense') return 'expense'
  if (draft?.type === 'adjustment') return 'adjustment'
  return 'unknown'
}

function sanitizeDraftLoanIntent(draft) {
  if (!draft?.loanIntent || typeof draft.loanIntent !== 'object') return draft
  const counterpartyName = toSafeString(draft.loanIntent.counterpartyName)
  const isInvalidCounterparty = !counterpartyName || counterpartyName.length < 2 || ['出', '入', '借', '還', '款', '錢'].includes(counterpartyName)
  if (!isInvalidCounterparty) return draft
  return {
    ...draft,
    loanIntent: {
      ...draft.loanIntent,
      counterpartyName: '',
    },
  }
}

function buildMissingRequirements({ warningKeys = [], draft = null, normalizedText = '', actionType = 'unknown' }) {
  const codes = new Set()
  const keySet = new Set(Array.isArray(warningKeys) ? warningKeys : [])

  if (keySet.has(AI_BOOKKEEPING_WARNING_KEY.INVALID_AMOUNT)) {
    codes.add('p1')
  }
  if (
    keySet.has(AI_BOOKKEEPING_WARNING_KEY.NO_ACCOUNT)
    || keySet.has(AI_BOOKKEEPING_WARNING_KEY.TRANSFER_ACCOUNTS_INSUFFICIENT)
  ) {
    codes.add('p2')
  }
  if (keySet.has(AI_BOOKKEEPING_WARNING_KEY.NO_CATEGORY) && !['new_category', 'query_analysis'].includes(actionType)) {
    codes.add('p0')
  }
  if (
    keySet.has(AI_BOOKKEEPING_WARNING_KEY.NO_COUNTERPARTY)
    || ((actionType === 'borrow' || actionType === 'lend') && !draft?.loanIntent?.counterpartyName)
    || (detectSpeechAddonExpectation(normalizedText) && !(Array.isArray(draft?.addonItems) && draft.addonItems.length))
  ) {
    codes.add('p3')
  }

  const catalog = {
    p0: { code: 'p0', label: '分類待選', field: 'category' },
    p1: { code: 'p1', label: '金額不足', field: 'amount' },
    p2: { code: 'p2', label: '帳戶不足', field: 'account' },
    p3: { code: 'p3', label: '附加項目不足', field: 'addon_or_counterparty' },
  }

  return Array.from(codes).map((code) => catalog[code]).filter(Boolean)
}

function buildSuggestionOptions(context, draft, missingRequirements) {
  const missingCodes = new Set((missingRequirements ?? []).map((item) => item.code))
  return {
    accounts: missingCodes.has('p2')
      ? context.accounts.slice(0, 12).map((item) => ({ value: item.id, label: item.name }))
      : [],
    categories: missingCodes.has('p0')
      ? (draft?.type === 'income' ? context.incomeCategories : context.expenseCategories)
        .slice(0, 12)
        .map((item) => ({ value: item.id, label: item.name }))
      : [],
    addonTemplates: missingCodes.has('p3')
      ? context.addonTemplates.slice(0, 10).map((item) => ({
        value: item.id,
        label: item.label,
        direction: item.defaultDirection,
      }))
      : [],
  }
}

export function parseSpeechBookkeeping({ text, context = {} } = {}) {
  const normalizedSource = normalizeTaiwaneseSpeechText(text)
  const safeContext = sanitizeSpeechParserContext(context)
  const parseResult = parseAutoBookkeepingText(normalizedSource.normalizedText, safeContext)
  const sanitizedDraft = sanitizeDraftLoanIntent(parseResult?.draft ?? null)
  const actionType = inferActionType(normalizedSource.normalizedText, sanitizedDraft)
  const warnings = Array.isArray(parseResult?.warnings)
    ? parseResult.warnings.map((warning, index) => {
      const warningKey = Array.isArray(parseResult?.warningKeys) ? parseResult.warningKeys[index] : ''
      return String(warning ?? '').trim() || getAiBookkeepingWarningFallback(warningKey)
    }).filter(Boolean)
    : []
  const missingRequirements = buildMissingRequirements({
    warningKeys: parseResult?.warningKeys,
    draft: sanitizedDraft,
    normalizedText: normalizedSource.normalizedText,
    actionType,
  })
  const needsConfirmation = !sanitizedDraft || warnings.length > 0 || missingRequirements.length > 0 || actionType === 'unknown'

  return {
    ...parseResult,
    draft: sanitizedDraft,
    actionType,
    needsConfirmation,
    missingRequirements,
    suggestionOptions: buildSuggestionOptions(safeContext, sanitizedDraft, missingRequirements),
    normalizedText: normalizedSource.normalizedText,
    normalizationApplied: normalizedSource.appliedRules,
  }
}

export {
  sanitizeSpeechParserContext,
}
