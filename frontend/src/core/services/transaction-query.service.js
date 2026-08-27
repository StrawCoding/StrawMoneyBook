import {
  HOME_TRANSACTION_PAGE_SIZE,
  listAllTransactionsChunked,
  listAnalysisAddonExpenseFacts,
  listAnalysisTimeBarFacts,
  listHomeTransactionsPage,
  listRelatedTransactionsForDetail,
  listTransactionsByAccount,
  listTransactionsByAccountPage,
  listTransactionsByDay,
  listTransactionsByMonth,
  listTransactionSearchPage,
  listTransactionsByYear,
  findTransactionListRowById,
  summarizeAnalysisBreakdown,
  summarizeHomeAssetTotalsByScope,
} from '@/core/repositories/transaction.repo'

const SCOPE_MODES = new Set(['all', 'year', 'month', 'day'])
export const TRANSACTION_PAGE_SIZE = 300
export const HOME_TRANSACTION_PAGE_SIZE_EXPORT = HOME_TRANSACTION_PAGE_SIZE

export function normalizeTransactionScopeMode(value, fallback = 'all') {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (SCOPE_MODES.has(normalized)) return normalized
  return SCOPE_MODES.has(String(fallback ?? '').trim().toLowerCase())
    ? String(fallback ?? '').trim().toLowerCase()
    : 'all'
}

function normalizePage(value) {
  const numeric = Math.trunc(Number(value))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1
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
  // Chunked + yield keeps large "all" analysis loads from blocking the main thread.
  return listAllTransactionsChunked(normalizedLedgerId)
}

export async function listTransactionsForAnalysis(ledgerId, options = {}) {
  return listTransactionsByScope(ledgerId, options)
}

export async function loadAnalysisStats(ledgerId, options = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  const scope = {
    mode: normalizeTransactionScopeMode(options.mode),
    key: String(options.key ?? '').trim(),
  }
  if (!normalizedLedgerId) {
    return {
      incomeCategory: [],
      expenseCategory: [],
      incomeAccount: [],
      expenseAccount: [],
      timeBarFacts: [],
      addonExpenseFacts: [],
    }
  }

  const [
    incomeCategory,
    expenseCategory,
    incomeAccount,
    expenseAccount,
    timeBarFacts,
    addonExpenseFacts,
  ] = await Promise.all([
    summarizeAnalysisBreakdown(normalizedLedgerId, { ...scope, type: 'income', scope: 'category' }),
    summarizeAnalysisBreakdown(normalizedLedgerId, { ...scope, type: 'expense', scope: 'category' }),
    summarizeAnalysisBreakdown(normalizedLedgerId, { ...scope, type: 'income', scope: 'account' }),
    summarizeAnalysisBreakdown(normalizedLedgerId, { ...scope, type: 'expense', scope: 'account' }),
    listAnalysisTimeBarFacts(normalizedLedgerId, scope),
    listAnalysisAddonExpenseFacts(normalizedLedgerId, scope),
  ])

  return {
    incomeCategory,
    expenseCategory,
    incomeAccount,
    expenseAccount,
    timeBarFacts,
    addonExpenseFacts,
  }
}

export async function listTransactionsForHome(ledgerId, options = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) {
    return { items: [], total: 0, page: 1, pageSize: HOME_TRANSACTION_PAGE_SIZE, totalPages: 1 }
  }

  const page = normalizePage(options.page)
  const pageSize = HOME_TRANSACTION_PAGE_SIZE
  const result = await listHomeTransactionsPage(normalizedLedgerId, {
    mode: normalizeTransactionScopeMode(options.mode, 'month'),
    key: String(options.key ?? '').trim(),
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
  const total = Number(result.total ?? 0)
  return {
    items: result.items ?? [],
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function summarizeHomeAssetTotals(ledgerId, options = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) {
    return { incomeMinor: 0, expenseMinor: 0 }
  }

  return summarizeHomeAssetTotalsByScope(normalizedLedgerId, {
    mode: normalizeTransactionScopeMode(options.mode, 'month'),
    key: String(options.key ?? '').trim(),
  })
}

export async function listTransactionsForSearch(ledgerId, options = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) {
    return { items: [], total: 0, page: 1, pageSize: TRANSACTION_PAGE_SIZE, totalPages: 1 }
  }
  const page = normalizePage(options.page)
  const pageSize = TRANSACTION_PAGE_SIZE
  const result = await listTransactionSearchPage(normalizedLedgerId, {
    ...options,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
  const total = Number(result.total ?? 0)
  return {
    items: result.items ?? [],
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
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

export async function listTransactionPageForAccount(ledgerId, accountId, options = {}) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  const normalizedAccountId = String(accountId ?? '').trim()
  if (!normalizedLedgerId || !normalizedAccountId) {
    return {
      items: [],
      total: 0,
      beforeAmountMinor: 0,
      page: 1,
      pageSize: TRANSACTION_PAGE_SIZE,
      totalPages: 1,
    }
  }
  const page = normalizePage(options.page)
  const pageSize = TRANSACTION_PAGE_SIZE
  const result = await listTransactionsByAccountPage(normalizedLedgerId, normalizedAccountId, {
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
  const total = Number(result.total ?? 0)
  return {
    items: result.items ?? [],
    total,
    beforeAmountMinor: Number(result.beforeAmountMinor ?? 0),
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function loadTransactionDetailContext(ledgerId, txId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  const normalizedTxId = String(txId ?? '').trim()
  if (!normalizedLedgerId || !normalizedTxId) {
    return { allTransactions: [], transaction: null }
  }

  const transaction = await findTransactionListRowById(normalizedLedgerId, normalizedTxId)
  if (!transaction) {
    return { allTransactions: [], transaction: null }
  }

  const allTransactions = await listRelatedTransactionsForDetail(normalizedLedgerId, transaction)
  return {
    allTransactions,
    transaction,
  }
}
