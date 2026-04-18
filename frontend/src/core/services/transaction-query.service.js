import {
  listAllTransactions,
  listTransactionsByAccount,
  listTransactionsByDay,
  listTransactionsByMonth,
  listTransactionsByYear,
} from '@/core/repositories/transaction.repo'

const SCOPE_MODES = new Set(['all', 'year', 'month', 'day'])

export function normalizeTransactionScopeMode(value, fallback = 'all') {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (SCOPE_MODES.has(normalized)) return normalized
  return SCOPE_MODES.has(String(fallback ?? '').trim().toLowerCase())
    ? String(fallback ?? '').trim().toLowerCase()
    : 'all'
}

export async function listTransactionsByScope(ledgerId, {
  mode = 'all',
  key = '',
} = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) return []

  const normalizedMode = normalizeTransactionScopeMode(mode)
  const normalizedKey = String(key ?? '').trim()

  if (normalizedMode === 'year') {
    return normalizedKey ? listTransactionsByYear(normalizedLedgerId, normalizedKey) : []
  }
  if (normalizedMode === 'month') {
    return normalizedKey ? listTransactionsByMonth(normalizedLedgerId, normalizedKey) : []
  }
  if (normalizedMode === 'day') {
    return normalizedKey ? listTransactionsByDay(normalizedLedgerId, normalizedKey) : []
  }
  return listAllTransactions(normalizedLedgerId)
}

export async function listTransactionsForAnalysis(ledgerId, options = {}) {
  return listTransactionsByScope(ledgerId, options)
}

export async function listTransactionsForSearch(ledgerId) {
  return listTransactionsByScope(ledgerId, { mode: 'all' })
}

export async function listTransactionsForCalendarMonth(ledgerId, monthKey) {
  return listTransactionsByScope(ledgerId, {
    mode: 'month',
    key: monthKey,
  })
}

export async function listTransactionsForAccount(ledgerId, accountId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  const normalizedAccountId = String(accountId ?? '').trim()
  if (!normalizedLedgerId || !normalizedAccountId) return []
  return listTransactionsByAccount(normalizedLedgerId, normalizedAccountId)
}

export async function loadTransactionDetailContext(ledgerId, txId) {
  const allTransactions = await listTransactionsByScope(ledgerId, { mode: 'all' })
  const normalizedTxId = String(txId ?? '').trim()
  return {
    allTransactions,
    transaction: allTransactions.find((item) => String(item?.id ?? '') === normalizedTxId) ?? null,
  }
}
