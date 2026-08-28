import { pickMatchedAutoFillRule } from '../../core/services/auto-fill-rule-match.js'
import { buildImportedNote } from './shared.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function joinNonEmpty(parts = []) {
  return parts
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .join(' ')
}

function mergeNotes(primary, secondary) {
  const uniqueParts = Array.from(new Set([primary, secondary].map((item) => normalizeText(item)).filter(Boolean)))
  return uniqueParts.join('｜')
}

export function buildBankImportRuleMatchText(row) {
  return joinNonEmpty([
    row?.summary,
    row?.merchant,
    row?.description,
    row?.note,
    row?.transaction_type,
    row?.bank_account_user_label,
    row?.bank_account_name,
  ])
}

export function resolveBankImportRule(row, rules = []) {
  return pickMatchedAutoFillRule(buildBankImportRuleMatchText(row), rules)
}

export function buildBankImportPlan(row, rules = []) {
  const mappedAccountId = normalizeText(row?.mapped_account_id)
  const amountMinor = Math.round(Number(row?.amount_minor ?? 0) || 0)
  const defaultType = amountMinor >= 0 ? 'income' : 'expense'
  const isIncome = amountMinor > 0
  const importedNote = buildImportedNote(row)
  const matchedRule = resolveBankImportRule(row, rules)

  if (!matchedRule) {
    return {
      mode: 'transaction',
      matchedRule: null,
      type: defaultType,
      accountId: mappedAccountId,
      peerAccountId: '',
      categoryId: '',
      note: importedNote,
      isReimbursable: false,
    }
  }

  if (matchedRule.type === 'transfer') {
    const fromAccountId = normalizeText(matchedRule.accountId) || mappedAccountId
    const toAccountId = normalizeText(matchedRule.peerAccountId)
    if (fromAccountId && toAccountId && fromAccountId !== toAccountId) {
      return {
        mode: 'transfer',
        matchedRule,
        fromAccountId: isIncome ? toAccountId : fromAccountId,
        toAccountId: isIncome ? fromAccountId : toAccountId,
        importedTxnSide: isIncome ? 'in' : 'out',
        note: mergeNotes(matchedRule.note, importedNote),
      }
    }
  }

  if (matchedRule.type !== defaultType) {
    return {
      mode: 'transaction',
      matchedRule: null,
      type: defaultType,
      accountId: mappedAccountId,
      peerAccountId: '',
      categoryId: '',
      note: importedNote,
      isReimbursable: false,
    }
  }

  return {
    mode: 'transaction',
    matchedRule,
    type: matchedRule.type,
    accountId: normalizeText(matchedRule.accountId) || mappedAccountId,
    peerAccountId: '',
    categoryId: normalizeText(matchedRule.categoryId),
    note: mergeNotes(matchedRule.note, importedNote),
    isReimbursable: matchedRule.type === 'expense' ? Boolean(matchedRule.isReimbursable) : false,
  }
}
