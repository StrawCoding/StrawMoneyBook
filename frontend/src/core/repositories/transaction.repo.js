import { query, run, withTransaction } from '@/core/db/sqlite'
import { createId, nowIso } from '@/core/utils/id'
import { assertLedgerId, firstRow, rowsOf } from '@/core/repositories/base.repo'
import { yieldToMainThread } from '@/core/utils/cooperative-yield'
import { toTransferLegAmounts } from '@/core/domain/posting/transfer-posting-policy.js'
import {
  refundDeductedMinorSql,
  refundRelationExistsSql,
} from '@/core/domain/refund-match-sql.js'

const RETAIN_IDEMPOTENCY_ON_SOFT_DELETE_SQL = `idempotency_key = CASE
         WHEN origin_type IN ('wear', 'import', 'einvoice') THEN idempotency_key
         ELSE NULL
       END`

function parseMonthKey(monthKey) {
  const matched = /^(\d{4})-(\d{2})$/.exec(String(monthKey ?? '').trim())
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
  return { year, month }
}

function parseDayKey(dayKey) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey ?? '').trim())
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const date = new Date(year, month - 1, day)
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null
  return { year, month, day }
}

function parseYearKey(yearKey) {
  const matched = /^(\d{4})$/.exec(String(yearKey ?? '').trim())
  if (!matched) return null
  const year = Number(matched[1])
  return Number.isInteger(year) ? year : null
}

function monthRangeUtc(monthKey) {
  const parsed = parseMonthKey(monthKey)
  if (!parsed) return null
  const { year, month } = parsed
  const start = new Date(year, month - 1, 1, 0, 0, 0)
  const end = new Date(year, month, 1, 0, 0, 0)

  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  }
}

function yearRangeUtc(yearKey) {
  const year = parseYearKey(yearKey)
  if (year === null) return null
  const start = new Date(year, 0, 1, 0, 0, 0)
  const end = new Date(year + 1, 0, 1, 0, 0, 0)
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  }
}

function dayRangeUtc(dayKey) {
  const parsed = parseDayKey(dayKey)
  if (!parsed) return null
  const { year, month, day } = parsed
  const start = new Date(year, month - 1, day, 0, 0, 0)
  const end = new Date(year, month - 1, day + 1, 0, 0, 0)
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  }
}

function paidClaimItemMinorSql(sourceAlias = 't') {
  return `COALESCE((
    SELECT SUM(ri.amount_minor)
    FROM reimbursement_items ri
    INNER JOIN reimbursements r
      ON r.ledger_id = ri.ledger_id
     AND r.id = ri.reimbursement_id
    WHERE ri.ledger_id = ${sourceAlias}.ledger_id
      AND ri.transaction_id = ${sourceAlias}.id
      AND r.deleted_at IS NULL
      AND r.status = 'paid'
  ), 0)`
}

function normalizeLimit(value, fallback = 300) {
  const numeric = Math.trunc(Number(value))
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return Math.min(numeric, 1000)
}

function normalizeOffset(value) {
  const numeric = Math.trunc(Number(value))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function transactionListLookupJoinsSql() {
  return `LEFT JOIN accounts a
       ON a.ledger_id = t.ledger_id
      AND a.id = t.account_id
     LEFT JOIN categories c
       ON c.ledger_id = t.ledger_id
      AND c.id = t.category_id
     LEFT JOIN loans l
       ON l.ledger_id = t.ledger_id
      AND l.id = t.external_ref_id
      AND t.origin_type = 'loan_payment'
      AND l.deleted_at IS NULL
     LEFT JOIN counterparties cp
       ON cp.ledger_id = l.ledger_id
      AND cp.id = l.counterparty_id`
}

function transactionListSelectSql() {
  return `SELECT t.ledger_id, t.id, t.type, t.transfer_group_id, t.account_id, t.peer_account_id,
            t.category_id, t.amount_minor, t.occurred_at, t.note, t.location, t.tags_json,
            c.name AS category_name, c.icon AS category_icon,
            a.currency_code AS account_currency_code,
            t.origin_type, t.external_ref_id, t.is_reimbursable, t.reimbursement_state,
            t.reimbursed_at, t.include_in_budget, t.include_in_analysis,
            CASE WHEN ${refundRelationExistsSql('t')} THEN 1 ELSE 0 END AS has_refund_link,
            ${refundDeductedMinorSql('t')} AS refund_deducted_minor,
            t.created_by_user_id, t.created_by_display_name,
            t.updated_by_user_id, t.updated_by_display_name,
            t.created_at, t.updated_at
     FROM transactions t
     ${transactionListLookupJoinsSql()}`
}

function transactionListOrderSql() {
  return 'ORDER BY t.occurred_at DESC, t.created_at DESC'
}

function buildSearchFilterClauses({
  keyword = '',
  startDay = '',
  endDay = '',
} = {}) {
  const clauses = ['t.ledger_id = ?', 't.deleted_at IS NULL']
  const values = []

  const normalizedStartDay = String(startDay ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedStartDay)) {
    clauses.push('t.occurred_at >= ?')
    values.push(dayRangeUtc(normalizedStartDay).startUtc)
  }

  const normalizedEndDay = String(endDay ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedEndDay)) {
    clauses.push('t.occurred_at < ?')
    values.push(dayRangeUtc(normalizedEndDay).endUtc)
  }

  const normalizedKeyword = String(keyword ?? '').trim().toLowerCase()
  if (normalizedKeyword) {
    for (const part of normalizedKeyword.split(/\s+/).filter(Boolean)) {
      clauses.push(`LOWER(
        COALESCE(c.name, '') || ' ' ||
        COALESCE(a.name, '') || ' ' ||
        COALESCE(t.note, '') || ' ' ||
        COALESCE(t.occurred_at, '') || ' ' ||
        COALESCE(t.type, '') || ' ' ||
        COALESCE(t.origin_type, '') || ' ' ||
        COALESCE(l.direction, '') || ' ' ||
        COALESCE(cp.name, '') || ' ' ||
        CASE
          WHEN t.origin_type = 'loan_payment' AND l.direction = 'lend' AND t.type = 'income' THEN '收回 收回借款 loan receive back loan_receive_back'
          WHEN t.origin_type = 'loan_payment' AND l.direction = 'lend' THEN '借出 loan lend loan_lend'
          WHEN t.origin_type = 'loan_payment' AND l.direction = 'borrow' AND t.type = 'expense' THEN '歸還 還款 loan repay loan_repay'
          WHEN t.origin_type = 'loan_payment' AND l.direction = 'borrow' THEN '借入 loan borrow loan_borrow'
          WHEN t.origin_type = 'loan_payment' AND t.type = 'income' THEN '收回 收回借款 loan receive back loan_receive_back'
          WHEN t.origin_type = 'loan_payment' THEN '借出 loan lend loan_lend'
          ELSE ''
        END || ' ' ||
        CAST(t.amount_minor AS TEXT) || ' ' ||
        CAST(ABS(t.amount_minor) / 100.0 AS TEXT)
      ) LIKE ?`)
      values.push(`%${part}%`)
    }
  }

  return { clauses, values }
}

export async function listRecentTransactions(ledgerId, limit = 20) {
  assertLedgerId(ledgerId)

  const result = await query(
    `SELECT t.ledger_id, t.id, t.type, t.transfer_group_id, t.account_id, t.peer_account_id,
            t.category_id, t.amount_minor, t.occurred_at, t.note, t.location, t.tags_json,
            c.name AS category_name, c.icon AS category_icon,
            a.currency_code AS account_currency_code,
            t.origin_type, t.external_ref_id, t.is_reimbursable, t.reimbursement_state,
            t.reimbursed_at, t.include_in_budget, t.include_in_analysis,
            CASE WHEN ${refundRelationExistsSql('t')} THEN 1 ELSE 0 END AS has_refund_link,
            ${refundDeductedMinorSql('t')} AS refund_deducted_minor,
            t.created_at
     FROM transactions t
     LEFT JOIN accounts a
       ON a.ledger_id = t.ledger_id
      AND a.id = t.account_id
     LEFT JOIN categories c
       ON c.ledger_id = t.ledger_id
      AND c.id = t.category_id
     WHERE t.ledger_id = ? AND t.deleted_at IS NULL
     ORDER BY t.occurred_at DESC, t.created_at DESC
     LIMIT ?;`,
    [ledgerId, limit],
  )

  return rowsOf(result)
}

export async function listTransactionsByMonth(ledgerId, monthKey) {
  assertLedgerId(ledgerId)

  const range = monthRangeUtc(monthKey)
  if (!range) return []
  const { startUtc, endUtc } = range
  const result = await query(
    `SELECT t.ledger_id, t.id, t.type, t.transfer_group_id, t.account_id, t.peer_account_id,
            t.category_id, t.amount_minor, t.occurred_at, t.note, t.location, t.tags_json,
            c.name AS category_name, c.icon AS category_icon,
            a.currency_code AS account_currency_code,
            t.origin_type, t.external_ref_id, t.is_reimbursable, t.reimbursement_state,
            t.reimbursed_at, t.include_in_budget, t.include_in_analysis,
            CASE WHEN ${refundRelationExistsSql('t')} THEN 1 ELSE 0 END AS has_refund_link,
            ${refundDeductedMinorSql('t')} AS refund_deducted_minor,
            t.created_at
     FROM transactions t
     LEFT JOIN accounts a
       ON a.ledger_id = t.ledger_id
      AND a.id = t.account_id
     LEFT JOIN categories c
       ON c.ledger_id = t.ledger_id
      AND c.id = t.category_id
     WHERE t.ledger_id = ?
       AND t.deleted_at IS NULL
       AND t.occurred_at >= ?
       AND t.occurred_at < ?
     ORDER BY t.occurred_at DESC, t.created_at DESC;`,
    [ledgerId, startUtc, endUtc],
  )

  return rowsOf(result)
}

export async function listTransactionsByYear(ledgerId, yearKey) {
  assertLedgerId(ledgerId)
  const range = yearRangeUtc(yearKey)
  if (!range) return []
  const { startUtc, endUtc } = range
  const result = await query(
    `SELECT t.ledger_id, t.id, t.type, t.transfer_group_id, t.account_id, t.peer_account_id,
            t.category_id, t.amount_minor, t.occurred_at, t.note, t.location, t.tags_json,
            c.name AS category_name, c.icon AS category_icon,
            a.currency_code AS account_currency_code,
            t.origin_type, t.external_ref_id, t.is_reimbursable, t.reimbursement_state,
            t.reimbursed_at, t.include_in_budget, t.include_in_analysis,
            CASE WHEN ${refundRelationExistsSql('t')} THEN 1 ELSE 0 END AS has_refund_link,
            ${refundDeductedMinorSql('t')} AS refund_deducted_minor,
            t.created_at
     FROM transactions t
     LEFT JOIN accounts a
       ON a.ledger_id = t.ledger_id
      AND a.id = t.account_id
     LEFT JOIN categories c
       ON c.ledger_id = t.ledger_id
      AND c.id = t.category_id
     WHERE t.ledger_id = ?
       AND t.deleted_at IS NULL
       AND t.occurred_at >= ?
       AND t.occurred_at < ?
     ORDER BY t.occurred_at DESC, t.created_at DESC;`,
    [ledgerId, startUtc, endUtc],
  )

  return rowsOf(result)
}

export async function listTransactionsByDay(ledgerId, dayKey) {
  assertLedgerId(ledgerId)
  const range = dayRangeUtc(dayKey)
  if (!range) return []
  const { startUtc, endUtc } = range
  const result = await query(
    `SELECT t.ledger_id, t.id, t.type, t.transfer_group_id, t.account_id, t.peer_account_id,
            t.category_id, t.amount_minor, t.occurred_at, t.note, t.location, t.tags_json,
            c.name AS category_name, c.icon AS category_icon,
            a.currency_code AS account_currency_code,
            t.origin_type, t.external_ref_id, t.is_reimbursable, t.reimbursement_state,
            t.reimbursed_at, t.include_in_budget, t.include_in_analysis,
            CASE WHEN ${refundRelationExistsSql('t')} THEN 1 ELSE 0 END AS has_refund_link,
            ${refundDeductedMinorSql('t')} AS refund_deducted_minor,
            t.created_at
     FROM transactions t
     LEFT JOIN accounts a
       ON a.ledger_id = t.ledger_id
      AND a.id = t.account_id
     LEFT JOIN categories c
       ON c.ledger_id = t.ledger_id
      AND c.id = t.category_id
     WHERE t.ledger_id = ?
       AND t.deleted_at IS NULL
       AND t.occurred_at >= ?
       AND t.occurred_at < ?
     ORDER BY t.occurred_at DESC, t.created_at DESC;`,
    [ledgerId, startUtc, endUtc],
  )

  return rowsOf(result)
}

export async function listAllTransactions(ledgerId, { limit, offset = 0 } = {}) {
  assertLedgerId(ledgerId)
  const hasLimit = Number.isFinite(limit) && limit > 0
  const safeOffset = normalizeOffset(offset)
  const result = await query(
    `SELECT t.ledger_id, t.id, t.type, t.transfer_group_id, t.account_id, t.peer_account_id,
            t.category_id, t.amount_minor, t.occurred_at, t.note, t.location, t.tags_json,
            c.name AS category_name, c.icon AS category_icon,
            a.currency_code AS account_currency_code,
            t.origin_type, t.external_ref_id, t.is_reimbursable, t.reimbursement_state,
            t.reimbursed_at, t.include_in_budget, t.include_in_analysis,
            CASE WHEN ${refundRelationExistsSql('t')} THEN 1 ELSE 0 END AS has_refund_link,
            ${refundDeductedMinorSql('t')} AS refund_deducted_minor,
            t.created_at
     FROM transactions t
     LEFT JOIN accounts a
       ON a.ledger_id = t.ledger_id
      AND a.id = t.account_id
     LEFT JOIN categories c
       ON c.ledger_id = t.ledger_id
      AND c.id = t.category_id
     WHERE t.ledger_id = ?
       AND t.deleted_at IS NULL
     ORDER BY t.occurred_at DESC, t.created_at DESC
     ${hasLimit ? 'LIMIT ? OFFSET ?' : ''};`,
    hasLimit ? [ledgerId, limit, safeOffset] : [ledgerId],
  )
  return rowsOf(result)
}

const ANALYSIS_TRANSACTION_CHUNK_SIZE = 500

export async function listAllTransactionsChunked(ledgerId, {
  chunkSize = ANALYSIS_TRANSACTION_CHUNK_SIZE,
} = {}) {
  assertLedgerId(ledgerId)
  const pageSize = Math.max(50, Math.min(1000, Math.trunc(Number(chunkSize)) || ANALYSIS_TRANSACTION_CHUNK_SIZE))
  const items = []
  let offset = 0

  while (true) {
    const page = await listAllTransactions(ledgerId, { limit: pageSize, offset })
    items.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
    await yieldToMainThread()
  }

  return items
}

export async function findTransactionListRowById(ledgerId, txId) {
  assertLedgerId(ledgerId)
  const normalizedTxId = String(txId ?? '').trim()
  if (!normalizedTxId) return null

  const result = await query(
    `${transactionListSelectSql()}
     WHERE t.ledger_id = ?
       AND t.id = ?
       AND t.deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, normalizedTxId],
  )
  return firstRow(result)
}

export async function listRelatedTransactionsForDetail(ledgerId, transaction) {
  assertLedgerId(ledgerId)
  const tx = transaction && typeof transaction === 'object' ? transaction : null
  if (!tx?.id) return []

  const byId = new Map()
  const absorb = (rows) => {
    for (const row of rows ?? []) {
      const id = String(row?.id ?? '').trim()
      if (!id || id === String(tx.id) || byId.has(id)) continue
      byId.set(id, row)
    }
  }

  const transferGroupId = String(tx.transfer_group_id ?? '').trim()
  if (transferGroupId) {
    const transferResult = await query(
      `${transactionListSelectSql()}
       WHERE t.ledger_id = ?
         AND t.transfer_group_id = ?
         AND t.deleted_at IS NULL
       ${transactionListOrderSql()};`,
      [ledgerId, transferGroupId],
    )
    absorb(rowsOf(transferResult))
  }

  const externalRefId = String(tx.external_ref_id ?? '').trim()
  if (externalRefId) {
    const source = await findTransactionListRowById(ledgerId, externalRefId)
    if (source) absorb([source])
  }

  const childrenResult = await query(
    `${transactionListSelectSql()}
     WHERE t.ledger_id = ?
       AND t.external_ref_id = ?
       AND t.deleted_at IS NULL
     ${transactionListOrderSql()};`,
    [ledgerId, String(tx.id)],
  )
  absorb(rowsOf(childrenResult))

  if (String(tx.origin_type ?? '') === 'loan_payment' && externalRefId) {
    const loanSiblingsResult = await query(
      `${transactionListSelectSql()}
       WHERE t.ledger_id = ?
         AND t.origin_type = 'loan_payment'
         AND t.external_ref_id = ?
         AND t.deleted_at IS NULL
       ${transactionListOrderSql()};`,
      [ledgerId, externalRefId],
    )
    absorb(rowsOf(loanSiblingsResult))
  }

  return [tx, ...byId.values()]
}

export const HOME_TRANSACTION_PAGE_SIZE = 300

function normalizeHomeTransactionLimit(value, fallback = HOME_TRANSACTION_PAGE_SIZE) {
  const numeric = Math.trunc(Number(value))
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return Math.min(numeric, HOME_TRANSACTION_PAGE_SIZE)
}

function buildHomeScopeFilterClauses(mode, key) {
  const normalizedMode = ['all', 'year', 'month', 'day'].includes(mode) ? mode : 'month'
  const normalizedKey = String(key ?? '').trim()
  const clauses = ['t.ledger_id = ?', 't.deleted_at IS NULL']
  const values = []

  if (normalizedMode === 'year') {
    if (!normalizedKey) return null
    const range = yearRangeUtc(normalizedKey)
    if (!range) return null
    const { startUtc, endUtc } = range
    clauses.push('t.occurred_at >= ?', 't.occurred_at < ?')
    values.push(startUtc, endUtc)
  } else if (normalizedMode === 'month') {
    if (!normalizedKey) return null
    const range = monthRangeUtc(normalizedKey)
    if (!range) return null
    const { startUtc, endUtc } = range
    clauses.push('t.occurred_at >= ?', 't.occurred_at < ?')
    values.push(startUtc, endUtc)
  } else if (normalizedMode === 'day') {
    if (!normalizedKey) return null
    const range = dayRangeUtc(normalizedKey)
    if (!range) return null
    const { startUtc, endUtc } = range
    clauses.push('t.occurred_at >= ?', 't.occurred_at < ?')
    values.push(startUtc, endUtc)
  }

  return { mode: normalizedMode, clauses, values }
}

function homeIncomeExpenseEffectiveMinorSql(rowAlias = 'scoped') {
  // Mirrors getEffectiveTransactionAmountMinor + getRefundDeductedMinor + isRefundTransaction.
  return `(CASE
    WHEN ${rowAlias}.origin_type = 'refund' THEN 0
    WHEN ${rowAlias}.external_ref_id IS NOT NULL
      AND TRIM(${rowAlias}.external_ref_id) != ''
      AND (
        ${rowAlias}.category_name = '退款'
        OR ${rowAlias}.note LIKE '退款：%'
        OR ${rowAlias}.note LIKE '退款:%'
      ) THEN 0
    WHEN ${rowAlias}.amount_minor = 0 THEN 0
    WHEN ${rowAlias}.refund_applied_minor >= ABS(${rowAlias}.amount_minor) THEN 0
    WHEN ${rowAlias}.amount_minor < 0 THEN -(ABS(${rowAlias}.amount_minor) - ${rowAlias}.refund_applied_minor)
    ELSE ABS(${rowAlias}.amount_minor) - ${rowAlias}.refund_applied_minor
  END)`
}

export async function listHomeTransactionsPage(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const scope = buildHomeScopeFilterClauses(options.mode, options.key)
  if (!scope) {
    return { items: [], total: 0, limit: HOME_TRANSACTION_PAGE_SIZE, offset: 0 }
  }

  const limit = normalizeHomeTransactionLimit(options.limit, HOME_TRANSACTION_PAGE_SIZE)
  const offset = normalizeOffset(options.offset)
  const whereSql = scope.clauses.join('\n       AND ')
  const params = [ledgerId, ...scope.values]

  const [itemsResult, countResult] = await Promise.all([
    query(
      `${transactionListSelectSql()}
       WHERE ${whereSql}
       ${transactionListOrderSql()}
       LIMIT ? OFFSET ?;`,
      [...params, limit, offset],
    ),
    query(
      `SELECT COUNT(*) AS total
       FROM transactions t
       WHERE ${whereSql};`,
      params,
    ),
  ])

  return {
    items: rowsOf(itemsResult),
    total: Number(firstRow(countResult)?.total ?? 0),
    limit,
    offset,
  }
}

export async function summarizeHomeAssetTotalsByScope(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const scope = buildHomeScopeFilterClauses(options.mode, options.key)
  if (!scope) {
    return { incomeMinor: 0, expenseMinor: 0 }
  }

  const whereSql = scope.clauses.join('\n       AND ')
  const params = [ledgerId, ...scope.values]
  const deductedSql = refundDeductedMinorSql('t')
  const hasRefundLinkSql = `CASE WHEN ${refundRelationExistsSql('t')} THEN 1 ELSE 0 END`

  const result = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN scoped.type = 'income' THEN scoped.effective_minor ELSE 0 END), 0) AS income_minor,
       COALESCE(SUM(CASE WHEN scoped.type = 'expense' THEN ABS(scoped.effective_minor) ELSE 0 END), 0) AS expense_minor
     FROM (
       SELECT
         base.type AS type,
         ${homeIncomeExpenseEffectiveMinorSql('base')} AS effective_minor
       FROM (
         SELECT
           t.type AS type,
           t.origin_type AS origin_type,
           t.external_ref_id AS external_ref_id,
           t.note AS note,
           t.amount_minor AS amount_minor,
           c.name AS category_name,
           CASE
             WHEN ${deductedSql} > 0 THEN MIN(ABS(t.amount_minor), ${deductedSql})
             WHEN ${hasRefundLinkSql} = 1 THEN ABS(t.amount_minor)
             ELSE 0
           END AS refund_applied_minor
         FROM transactions t
         LEFT JOIN categories c
           ON c.ledger_id = t.ledger_id
          AND c.id = t.category_id
         WHERE ${whereSql}
           AND COALESCE(t.include_in_analysis, 1) != 0
           AND COALESCE(t.origin_type, '') != 'loan_payment'
       ) base
     ) scoped;`,
    params,
  )

  const row = firstRow(result)
  return {
    incomeMinor: Number(row?.income_minor ?? 0),
    expenseMinor: Number(row?.expense_minor ?? 0),
  }
}

function analysisCountableInnerSelectSql(whereSql, deductedSql, hasRefundLinkSql) {
  return `SELECT
           t.account_id AS account_id,
           t.category_id AS category_id,
           t.type AS type,
           t.origin_type AS origin_type,
           t.external_ref_id AS external_ref_id,
           t.note AS note,
           t.amount_minor AS amount_minor,
           t.occurred_at AS occurred_at,
           t.include_in_analysis AS include_in_analysis,
           c.name AS category_name,
           CASE
             WHEN ${deductedSql} > 0 THEN MIN(ABS(t.amount_minor), ${deductedSql})
             WHEN ${hasRefundLinkSql} = 1 THEN ABS(t.amount_minor)
             ELSE 0
           END AS refund_applied_minor,
           ${deductedSql} AS refund_deducted_minor,
           ${hasRefundLinkSql} AS has_refund_link
         FROM transactions t
         LEFT JOIN categories c
           ON c.ledger_id = t.ledger_id
          AND c.id = t.category_id
         WHERE ${whereSql}
           AND COALESCE(t.include_in_analysis, 1) != 0
           AND COALESCE(t.origin_type, '') != 'loan_payment'`
}

export async function summarizeAnalysisBreakdown(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const scopeFilter = buildHomeScopeFilterClauses(options.mode, options.key)
  if (!scopeFilter) return []

  const normalizedType = options.type === 'income' ? 'income' : 'expense'
  const dimension = options.scope === 'account' ? 'account' : 'category'
  const bucketExpr = dimension === 'account'
    ? `COALESCE(NULLIF(TRIM(scoped.account_id), ''), '__unassigned_account__')`
    : `COALESCE(NULLIF(TRIM(scoped.category_id), ''), '__uncategorized__')`
  const amountExpr = normalizedType === 'expense'
    ? 'ABS(scoped.effective_minor)'
    : 'scoped.effective_minor'
  const whereSql = scopeFilter.clauses.join('\n       AND ')
  const params = [ledgerId, ...scopeFilter.values, normalizedType]
  const deductedSql = refundDeductedMinorSql('t')
  const hasRefundLinkSql = `CASE WHEN ${refundRelationExistsSql('t')} THEN 1 ELSE 0 END`

  const result = await query(
    `SELECT
       ${bucketExpr} AS bucket_id,
       COUNT(*) AS txn_count,
       COALESCE(SUM(${amountExpr}), 0) AS amount_minor
     FROM (
       SELECT
         inner_row.account_id AS account_id,
         inner_row.category_id AS category_id,
         ${homeIncomeExpenseEffectiveMinorSql('inner_row')} AS effective_minor
       FROM (
         ${analysisCountableInnerSelectSql(whereSql, deductedSql, hasRefundLinkSql)}
           AND t.type = ?
       ) inner_row
     ) scoped
     WHERE scoped.effective_minor != 0
     GROUP BY bucket_id
     ORDER BY amount_minor DESC;`,
    params,
  )

  return rowsOf(result).map((row) => ({
    id: String(row?.bucket_id ?? '').trim(),
    amountMinor: Number(row?.amount_minor ?? 0) || 0,
    count: Number(row?.txn_count ?? 0) || 0,
  })).filter((row) => row.id && row.amountMinor > 0)
}

export async function listAnalysisTimeBarFacts(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const scopeFilter = buildHomeScopeFilterClauses(options.mode, options.key)
  if (!scopeFilter) return []

  const whereSql = scopeFilter.clauses.join('\n       AND ')
  const params = [ledgerId, ...scopeFilter.values]
  const deductedSql = refundDeductedMinorSql('t')
  const hasRefundLinkSql = `CASE WHEN ${refundRelationExistsSql('t')} THEN 1 ELSE 0 END`

  const result = await query(
    `SELECT
       inner_row.type AS type,
       inner_row.origin_type AS origin_type,
       inner_row.occurred_at AS occurred_at,
       inner_row.amount_minor AS amount_minor,
       inner_row.include_in_analysis AS include_in_analysis,
       inner_row.refund_deducted_minor AS refund_deducted_minor,
       inner_row.has_refund_link AS has_refund_link,
       ${homeIncomeExpenseEffectiveMinorSql('inner_row')} AS effective_minor
     FROM (
       ${analysisCountableInnerSelectSql(whereSql, deductedSql, hasRefundLinkSql)}
     ) inner_row;`,
    params,
  )

  return rowsOf(result).map((row) => ({
    type: row?.type,
    origin_type: row?.origin_type,
    occurred_at: row?.occurred_at,
    amount_minor: Number(row?.amount_minor ?? 0) || 0,
    include_in_analysis: Number(row?.include_in_analysis ?? 1),
    refund_deducted_minor: Number(row?.refund_deducted_minor ?? 0) || 0,
    has_refund_link: Number(row?.has_refund_link ?? 0) || 0,
  }))
}

export async function listAnalysisAddonExpenseFacts(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const scopeFilter = buildHomeScopeFilterClauses(options.mode, options.key)
  if (!scopeFilter) return []

  const whereSql = scopeFilter.clauses.join('\n       AND ')
  const params = [ledgerId, ...scopeFilter.values]
  const deductedSql = refundDeductedMinorSql('t')
  const hasRefundLinkSql = `CASE WHEN ${refundRelationExistsSql('t')} THEN 1 ELSE 0 END`

  const result = await query(
    `SELECT
       inner_row.category_id AS category_id,
       inner_row.type AS type,
       inner_row.origin_type AS origin_type,
       inner_row.note AS note,
       inner_row.amount_minor AS amount_minor,
       inner_row.include_in_analysis AS include_in_analysis,
       inner_row.refund_deducted_minor AS refund_deducted_minor,
       inner_row.has_refund_link AS has_refund_link
     FROM (
       ${analysisCountableInnerSelectSql(whereSql, deductedSql, hasRefundLinkSql)}
         AND t.type = 'expense'
         AND t.note LIKE '%【附加項目】%'
     ) inner_row;`,
    params,
  )

  return rowsOf(result)
}

export async function listTransactionSearchPage(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const limit = normalizeLimit(options.limit, 300)
  const offset = normalizeOffset(options.offset)
  const { clauses, values } = buildSearchFilterClauses(options)
  const whereSql = clauses.join('\n       AND ')
  const params = [ledgerId, ...values]

  const [itemsResult, countResult] = await Promise.all([
    query(
      `${transactionListSelectSql()}
       WHERE ${whereSql}
       ${transactionListOrderSql()}
       LIMIT ? OFFSET ?;`,
      [...params, limit, offset],
    ),
    query(
      `SELECT COUNT(*) AS total
       FROM transactions t
       ${transactionListLookupJoinsSql()}
       WHERE ${whereSql};`,
      params,
    ),
  ])

  return {
    items: rowsOf(itemsResult),
    total: Number(firstRow(countResult)?.total ?? 0),
    limit,
    offset,
  }
}

export async function listTransactionOccurredAtValues(ledgerId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT occurred_at
     FROM transactions
     WHERE ledger_id = ?
       AND deleted_at IS NULL
     ORDER BY occurred_at DESC, created_at DESC;`,
    [ledgerId],
  )

  return rowsOf(result)
    .map((row) => String(row?.occurred_at ?? '').trim())
    .filter(Boolean)
}

export async function listTransactionsByAccount(ledgerId, accountId) {
  assertLedgerId(ledgerId)

  const result = await query(
    `SELECT t.ledger_id, t.id, t.type, t.transfer_group_id, t.account_id, t.peer_account_id,
            t.category_id, t.amount_minor, t.occurred_at, t.note, t.location, t.tags_json,
            c.name AS category_name, c.icon AS category_icon,
            a.currency_code AS account_currency_code,
            t.origin_type, t.external_ref_id, t.is_reimbursable, t.reimbursement_state,
            t.reimbursed_at, t.include_in_budget, t.include_in_analysis,
            CASE WHEN ${refundRelationExistsSql('t')} THEN 1 ELSE 0 END AS has_refund_link,
            ${refundDeductedMinorSql('t')} AS refund_deducted_minor,
            t.created_at
     FROM transactions t
     LEFT JOIN accounts a
       ON a.ledger_id = t.ledger_id
      AND a.id = t.account_id
     LEFT JOIN categories c
       ON c.ledger_id = t.ledger_id
      AND c.id = t.category_id
     WHERE t.ledger_id = ?
       AND (t.account_id = ? OR t.peer_account_id = ?)
       AND t.deleted_at IS NULL
     ORDER BY t.occurred_at DESC, t.created_at DESC;`,
    [ledgerId, accountId, accountId],
  )

  return rowsOf(result)
}

export async function listTransactionsByAccountPage(ledgerId, accountId, options = {}) {
  assertLedgerId(ledgerId)
  const normalizedAccountId = String(accountId ?? '').trim()
  if (!normalizedAccountId) {
    return { items: [], total: 0, beforeAmountMinor: 0, limit: normalizeLimit(options.limit, 300), offset: 0 }
  }

  const limit = normalizeLimit(options.limit, 300)
  const offset = normalizeOffset(options.offset)
  const whereSql = `t.ledger_id = ?
       AND t.account_id = ?
       AND t.deleted_at IS NULL`
  const params = [ledgerId, normalizedAccountId]

  const [itemsResult, countResult, beforeResult] = await Promise.all([
    query(
      `${transactionListSelectSql()}
       WHERE ${whereSql}
       ${transactionListOrderSql()}
       LIMIT ? OFFSET ?;`,
      [...params, limit, offset],
    ),
    query(
      `SELECT COUNT(*) AS total
       FROM transactions t
       WHERE ${whereSql};`,
      params,
    ),
    query(
      `SELECT COALESCE(SUM(amount_minor), 0) AS before_amount_minor
       FROM (
         SELECT t.amount_minor
         FROM transactions t
         WHERE ${whereSql}
         ${transactionListOrderSql()}
         LIMIT ?
       ) ordered_before_page;`,
      [...params, offset],
    ),
  ])

  return {
    items: rowsOf(itemsResult),
    total: Number(firstRow(countResult)?.total ?? 0),
    beforeAmountMinor: Number(firstRow(beforeResult)?.before_amount_minor ?? 0),
    limit,
    offset,
  }
}

export async function listReimbursementTransactions(ledgerId, state) {
  assertLedgerId(ledgerId)

  const normalizedState = state === 'all'
    ? 'all'
    : state === 'reimbursed'
      ? 'reimbursed'
      : 'pending'
  const values = [ledgerId]
  const stateClause = normalizedState === 'all'
    ? ''
    : `
       AND t.reimbursement_state = ?`

  if (normalizedState !== 'all') {
    values.push(normalizedState)
  }

  const result = await query(
    `SELECT t.ledger_id, t.id, t.type, t.account_id, t.category_id, t.amount_minor,
            t.occurred_at, t.note, t.is_reimbursable, t.reimbursement_state, t.reimbursed_at,
            t.reimburse_target_minor,
            t.include_in_budget, t.include_in_analysis, c.name AS category_name,
            (
              SELECT rt.id
              FROM transactions rt
              WHERE rt.ledger_id = t.ledger_id
                AND rt.deleted_at IS NULL
                AND rt.type = 'income'
                AND rt.origin_type = 'reimbursement'
                AND rt.external_ref_id = t.id
              ORDER BY rt.created_at DESC
              LIMIT 1
            ) AS reimbursed_tx_id,
            (
              SELECT rt.account_id
              FROM transactions rt
              WHERE rt.ledger_id = t.ledger_id
                AND rt.deleted_at IS NULL
                AND rt.type = 'income'
                AND rt.origin_type = 'reimbursement'
                AND rt.external_ref_id = t.id
              ORDER BY rt.created_at DESC
              LIMIT 1
            ) AS reimbursed_account_id,
            COALESCE((
              SELECT SUM(u.amount_minor)
              FROM reimbursement_advance_usages u
              WHERE u.ledger_id = t.ledger_id
                AND u.expense_tx_id = t.id
            ), 0) AS advance_used_minor,
            COALESCE((
              SELECT GROUP_CONCAT(u.advance_id, ',')
              FROM reimbursement_advance_usages u
              WHERE u.ledger_id = t.ledger_id
                AND u.expense_tx_id = t.id
            ), '') AS advance_ids_csv,
            COALESCE((
              SELECT GROUP_CONCAT(u.advance_id || ':' || u.amount_minor, ',')
              FROM reimbursement_advance_usages u
              WHERE u.ledger_id = t.ledger_id
                AND u.expense_tx_id = t.id
            ), '') AS advance_usage_pairs,
            COALESCE((
              SELECT SUM(rt.amount_minor)
              FROM transactions rt
              WHERE rt.ledger_id = t.ledger_id
                AND rt.deleted_at IS NULL
                AND rt.type = 'income'
                AND rt.origin_type = 'reimbursement'
                AND rt.external_ref_id = t.id
            ), 0) AS cash_reimbursed_minor,
            ${paidClaimItemMinorSql('t')} AS claim_reimbursed_minor,
            COALESCE((
              SELECT SUM(rt.amount_minor)
              FROM transactions rt
              WHERE rt.ledger_id = t.ledger_id
                AND rt.deleted_at IS NULL
                AND rt.type = 'income'
                AND rt.origin_type = 'reimbursement'
                AND rt.external_ref_id = t.id
            ), 0)
            +
            COALESCE((
              SELECT SUM(u.amount_minor)
              FROM reimbursement_advance_usages u
              WHERE u.ledger_id = t.ledger_id
                AND u.expense_tx_id = t.id
            ), 0)
            +
            ${paidClaimItemMinorSql('t')} AS reimbursed_minor
     FROM transactions t
     LEFT JOIN categories c
       ON c.ledger_id = t.ledger_id
      AND c.id = t.category_id
     WHERE t.ledger_id = ?
       AND t.deleted_at IS NULL
       AND t.type = 'expense'
       AND t.is_reimbursable = 1
       ${stateClause}
     ORDER BY t.occurred_at DESC, t.created_at DESC;`,
    values,
  )

  return rowsOf(result)
}

export async function findReimbursementTransactionById(ledgerId, txId) {
  assertLedgerId(ledgerId)
  const normalizedTxId = String(txId ?? '').trim()
  if (!normalizedTxId) return null

  const result = await query(
    `SELECT t.ledger_id, t.id, t.type, t.account_id, t.category_id, t.amount_minor,
            t.occurred_at, t.note, t.is_reimbursable, t.reimbursement_state, t.reimbursed_at,
            t.reimburse_target_minor,
            t.include_in_budget, t.include_in_analysis, c.name AS category_name,
            (
              SELECT rt.id
              FROM transactions rt
              WHERE rt.ledger_id = t.ledger_id
                AND rt.deleted_at IS NULL
                AND rt.type = 'income'
                AND rt.origin_type = 'reimbursement'
                AND rt.external_ref_id = t.id
              ORDER BY rt.created_at DESC
              LIMIT 1
            ) AS reimbursed_tx_id,
            (
              SELECT rt.account_id
              FROM transactions rt
              WHERE rt.ledger_id = t.ledger_id
                AND rt.deleted_at IS NULL
                AND rt.type = 'income'
                AND rt.origin_type = 'reimbursement'
                AND rt.external_ref_id = t.id
              ORDER BY rt.created_at DESC
              LIMIT 1
            ) AS reimbursed_account_id,
            COALESCE((
              SELECT SUM(u.amount_minor)
              FROM reimbursement_advance_usages u
              WHERE u.ledger_id = t.ledger_id
                AND u.expense_tx_id = t.id
            ), 0) AS advance_used_minor,
            COALESCE((
              SELECT GROUP_CONCAT(u.advance_id, ',')
              FROM reimbursement_advance_usages u
              WHERE u.ledger_id = t.ledger_id
                AND u.expense_tx_id = t.id
            ), '') AS advance_ids_csv,
            COALESCE((
              SELECT GROUP_CONCAT(u.advance_id || ':' || u.amount_minor, ',')
              FROM reimbursement_advance_usages u
              WHERE u.ledger_id = t.ledger_id
                AND u.expense_tx_id = t.id
            ), '') AS advance_usage_pairs,
            COALESCE((
              SELECT SUM(rt.amount_minor)
              FROM transactions rt
              WHERE rt.ledger_id = t.ledger_id
                AND rt.deleted_at IS NULL
                AND rt.type = 'income'
                AND rt.origin_type = 'reimbursement'
                AND rt.external_ref_id = t.id
            ), 0) AS cash_reimbursed_minor,
            ${paidClaimItemMinorSql('t')} AS claim_reimbursed_minor,
            COALESCE((
              SELECT SUM(rt.amount_minor)
              FROM transactions rt
              WHERE rt.ledger_id = t.ledger_id
                AND rt.deleted_at IS NULL
                AND rt.type = 'income'
                AND rt.origin_type = 'reimbursement'
                AND rt.external_ref_id = t.id
            ), 0)
            +
            COALESCE((
              SELECT SUM(u.amount_minor)
              FROM reimbursement_advance_usages u
              WHERE u.ledger_id = t.ledger_id
                AND u.expense_tx_id = t.id
            ), 0)
            +
            ${paidClaimItemMinorSql('t')} AS reimbursed_minor
     FROM transactions t
     LEFT JOIN categories c
       ON c.ledger_id = t.ledger_id
      AND c.id = t.category_id
     WHERE t.ledger_id = ?
       AND t.id = ?
       AND t.deleted_at IS NULL
       AND t.type = 'expense'
       AND t.is_reimbursable = 1
     LIMIT 1;`,
    [ledgerId, normalizedTxId],
  )

  return firstRow(result)
}

export async function countReimbursableTransactions(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const excludeTxId = String(options?.excludeTxId ?? '').trim()

  const values = [ledgerId]
  let excludeClause = ''
  if (excludeTxId) {
    excludeClause = ' AND id != ?'
    values.push(excludeTxId)
  }

  const result = await query(
    `SELECT COUNT(*) AS total
     FROM transactions
     WHERE ledger_id = ?
       AND deleted_at IS NULL
       AND type = 'expense'
       AND is_reimbursable = 1${excludeClause};`,
    values,
  )

  return Number(firstRow(result)?.total ?? 0)
}

export async function findReimbursementSettlementIncomeTx(ledgerId, expenseTxId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT id, amount_minor, occurred_at
     FROM transactions
     WHERE ledger_id = ?
       AND deleted_at IS NULL
       AND type = 'income'
       AND origin_type = 'reimbursement'
       AND external_ref_id = ?
     ORDER BY created_at DESC
     LIMIT 1;`,
    [ledgerId, expenseTxId],
  )
  return rowsOf(result)[0] ?? null
}

export async function getPaidClaimItemMinorByTransactionId(ledgerId, expenseTxId) {
  assertLedgerId(ledgerId)

  const result = await query(
    `SELECT ${paidClaimItemMinorSql('t')} AS claim_reimbursed_minor
     FROM transactions t
     WHERE t.ledger_id = ?
       AND t.id = ?
       AND t.deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, expenseTxId],
  )

  return Math.max(0, Math.round(Number(firstRow(result)?.claim_reimbursed_minor ?? 0)))
}

function normalizeReimburseTargetMinor(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Math.round(Number(value))
  if (!Number.isFinite(numeric) || numeric < 0) return null
  return numeric
}

export async function updateTransactionReimburseTargetMinor(ledgerId, txId, targetMinor) {
  assertLedgerId(ledgerId)

  await run(
    `UPDATE transactions
     SET reimburse_target_minor = ?,
         updated_at = ?
     WHERE ledger_id = ?
       AND id = ?
       AND deleted_at IS NULL
       AND is_reimbursable = 1;`,
    [normalizeReimburseTargetMinor(targetMinor), nowIso(), ledgerId, txId],
  )
}

export async function markTransactionReimbursed(ledgerId, txId, reimbursed) {
  assertLedgerId(ledgerId)

  await run(
    `UPDATE transactions
     SET reimbursement_state = ?,
         reimbursed_at = ?,
         updated_at = ?
     WHERE ledger_id = ?
       AND id = ?
       AND is_reimbursable = 1;`,
    [reimbursed ? 'reimbursed' : 'pending', reimbursed ? nowIso() : null, nowIso(), ledgerId, txId],
  )
}

export async function updateTransactionById(ledgerId, txId, input) {
  assertLedgerId(ledgerId)

  await run(
    `UPDATE transactions
     SET account_id = ?,
         peer_account_id = ?,
         category_id = ?,
         amount_minor = ?,
         occurred_at = ?,
         note = ?,
         is_reimbursable = ?,
         reimbursement_state = ?,
         include_in_budget = ?,
         include_in_analysis = ?,
         updated_by_user_id = COALESCE(?, updated_by_user_id),
         updated_by_display_name = COALESCE(?, updated_by_display_name),
         updated_at = ?
     WHERE ledger_id = ?
       AND id = ?
       AND deleted_at IS NULL;`,
    [
      input.accountId,
      input.peerAccountId ?? null,
      input.categoryId ?? null,
      input.amountMinor,
      input.occurredAt,
      input.note ?? null,
      input.isReimbursable ? 1 : 0,
      input.reimbursementState ?? 'none',
      input.includeInBudget === false ? 0 : 1,
      input.includeInAnalysis === false ? 0 : 1,
      input.updatedByUserId ?? null,
      input.updatedByDisplayName ?? null,
      nowIso(),
      ledgerId,
      txId,
    ],
  )
}

export async function findTransactionById(ledgerId, txId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT id, type, transfer_group_id, origin_type, external_ref_id, is_reimbursable,
            CASE WHEN ${refundRelationExistsSql('transactions')} THEN 1 ELSE 0 END AS has_refund_link,
            ${refundDeductedMinorSql('transactions')} AS refund_deducted_minor
     FROM transactions
     WHERE ledger_id = ?
       AND id = ?
       AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, txId],
  )
  return rowsOf(result)[0] ?? null
}

export async function listTransferTransactionsByGroup(ledgerId, transferGroupId) {
  assertLedgerId(ledgerId)
  if (!transferGroupId) return []
  const result = await query(
    `SELECT id, account_id, peer_account_id, amount_minor
     FROM transactions
     WHERE ledger_id = ?
       AND transfer_group_id = ?
       AND type = 'transfer'
       AND deleted_at IS NULL
     ORDER BY created_at ASC;`,
    [ledgerId, transferGroupId],
  )
  return rowsOf(result)
}

export async function findTransactionRecordById(ledgerId, txId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT t.ledger_id, t.id, t.type, t.transfer_group_id, t.account_id, t.peer_account_id, t.category_id,
            t.amount_minor, t.occurred_at, t.posted_at, t.note, t.origin_type, t.external_ref_id,
            t.is_reimbursable, t.reimbursement_state, t.reimburse_target_minor,
            t.include_in_budget, t.include_in_analysis,
            CASE WHEN ${refundRelationExistsSql('t')} THEN 1 ELSE 0 END AS has_refund_link,
            ${refundDeductedMinorSql('t')} AS refund_deducted_minor,
            t.created_by_user_id, t.created_by_display_name,
            t.updated_by_user_id, t.updated_by_display_name,
            t.created_at, t.updated_at,
            c.name AS category_name, c.kind AS category_kind, c.icon AS category_icon,
            cg.name AS category_group_name, cg.kind AS category_group_kind,
            a.name AS account_name, a.currency_code AS account_currency_code
     FROM transactions t
     LEFT JOIN categories c
       ON c.ledger_id = t.ledger_id
      AND c.id = t.category_id
     LEFT JOIN category_groups cg
       ON cg.ledger_id = c.ledger_id
      AND cg.id = c.group_id
     LEFT JOIN accounts a
       ON a.ledger_id = t.ledger_id
      AND a.id = t.account_id
     WHERE t.ledger_id = ?
       AND t.id = ?
       AND t.deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, txId],
  )
  return rowsOf(result)[0] ?? null
}

export async function listTransactionsByExternalRef(ledgerId, externalRefId) {
  assertLedgerId(ledgerId)
  if (!externalRefId) return []
  const result = await query(
    `SELECT t.ledger_id, t.id, t.type, t.transfer_group_id, t.account_id, t.peer_account_id, t.category_id,
            t.amount_minor, t.occurred_at, t.note, t.origin_type, t.external_ref_id,
            t.is_reimbursable, t.reimbursement_state, t.include_in_budget, t.include_in_analysis,
            CASE WHEN ${refundRelationExistsSql('t')} THEN 1 ELSE 0 END AS has_refund_link,
            ${refundDeductedMinorSql('t')} AS refund_deducted_minor,
            c.name AS category_name, c.kind AS category_kind, c.icon AS category_icon,
            cg.name AS category_group_name, cg.kind AS category_group_kind,
            a.name AS account_name
     FROM transactions t
     LEFT JOIN categories c
       ON c.ledger_id = t.ledger_id
      AND c.id = t.category_id
     LEFT JOIN category_groups cg
       ON cg.ledger_id = c.ledger_id
      AND cg.id = c.group_id
     LEFT JOIN accounts a
       ON a.ledger_id = t.ledger_id
      AND a.id = t.account_id
     WHERE t.ledger_id = ?
       AND t.external_ref_id = ?
       AND t.deleted_at IS NULL
     ORDER BY t.created_at DESC;`,
    [ledgerId, externalRefId],
  )
  return rowsOf(result)
}

export async function findTransactionByIdempotencyKey(ledgerId, idempotencyKey) {
  assertLedgerId(ledgerId)
  if (!idempotencyKey) return null
  const result = await query(
    `SELECT id, type, transfer_group_id, amount_minor, occurred_at
     FROM transactions
     WHERE ledger_id = ?
       AND idempotency_key = ?
       AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, idempotencyKey],
  )
  return firstRow(result)
}

export async function softDeleteTransactionById(ledgerId, txId) {
  assertLedgerId(ledgerId)
  const now = nowIso()
  await run(
    `UPDATE transactions
     SET deleted_at = ?,
         ${RETAIN_IDEMPOTENCY_ON_SOFT_DELETE_SQL},
         updated_at = ?
     WHERE ledger_id = ?
       AND id = ?
       AND deleted_at IS NULL;`,
    [now, now, ledgerId, txId],
  )
}

export async function softDeleteTransferGroup(ledgerId, transferGroupId) {
  assertLedgerId(ledgerId)
  const now = nowIso()
  await run(
    `UPDATE transactions
     SET deleted_at = ?,
         ${RETAIN_IDEMPOTENCY_ON_SOFT_DELETE_SQL},
         updated_at = ?
     WHERE ledger_id = ?
       AND transfer_group_id = ?
       AND deleted_at IS NULL;`,
    [now, now, ledgerId, transferGroupId],
  )
}

export async function softDeleteTransactionsByOriginRef(ledgerId, originType, externalRefId) {
  assertLedgerId(ledgerId)
  const now = nowIso()
  await run(
    `UPDATE transactions
     SET deleted_at = ?,
         ${RETAIN_IDEMPOTENCY_ON_SOFT_DELETE_SQL},
         updated_at = ?
     WHERE ledger_id = ?
       AND origin_type = ?
       AND external_ref_id = ?
       AND deleted_at IS NULL;`,
    [now, now, ledgerId, String(originType ?? ''), String(externalRefId ?? '')],
  )
}

export async function restoreSoftDeletedTransactionsByOriginRef(ledgerId, originType, externalRefId) {
  assertLedgerId(ledgerId)
  const now = nowIso()
  await run(
    `UPDATE transactions
     SET deleted_at = NULL,
         updated_at = ?
     WHERE ledger_id = ?
       AND origin_type = ?
       AND external_ref_id = ?
       AND deleted_at IS NOT NULL;`,
    [now, ledgerId, String(originType ?? ''), String(externalRefId ?? '')],
  )
}

export async function findTransactionExternalRefIncludingDeleted(ledgerId, txId) {
  assertLedgerId(ledgerId)
  if (!txId) return null
  const result = await query(
    `SELECT id, origin_type, external_ref_id, deleted_at
     FROM transactions
     WHERE ledger_id = ?
       AND id = ?
     LIMIT 1;`,
    [ledgerId, String(txId)],
  )
  return firstRow(result) ?? null
}

export async function addTransaction(ledgerId, input) {
  assertLedgerId(ledgerId)

  const id = input.id ?? createId('tx')
  const now = nowIso()

  await run(
    `INSERT INTO transactions (
      ledger_id, id, type, transfer_group_id, account_id, peer_account_id,
      category_id, amount_minor, occurred_at, posted_at, note, location, tags_json, origin_type,
      external_ref_id, idempotency_key, is_reimbursable, reimbursement_state,
      reimbursed_at, reimburse_target_minor, include_in_budget, include_in_analysis,
      created_by_user_id, created_by_display_name, updated_by_user_id, updated_by_display_name,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      ledgerId,
      id,
      input.type,
      input.transferGroupId ?? null,
      input.accountId,
      input.peerAccountId ?? null,
      input.categoryId ?? null,
      input.amountMinor,
      input.occurredAt,
      input.postedAt ?? input.occurredAt ?? null,
      input.note ?? null,
      input.location ?? null,
      input.tagsJson ?? null,
      input.originType ?? 'manual',
      input.externalRefId ?? null,
      input.idempotencyKey ?? null,
      input.isReimbursable ? 1 : 0,
      input.reimbursementState ?? 'none',
      input.reimbursedAt ?? null,
      normalizeReimburseTargetMinor(input.reimburseTargetMinor),
      input.includeInBudget === false ? 0 : 1,
      input.includeInAnalysis === false ? 0 : 1,
      input.createdByUserId ?? null,
      input.createdByDisplayName ?? null,
      input.updatedByUserId ?? input.createdByUserId ?? null,
      input.updatedByDisplayName ?? input.createdByDisplayName ?? null,
      now,
      now,
    ],
  )

  return id
}

export async function addTransfer(ledgerId, input) {
  assertLedgerId(ledgerId)

  const transferGroupId = input.transferGroupId ?? createId('tf')
  const occurredAt = input.occurredAt
  const legs = toTransferLegAmounts(input)

  return withTransaction(async () => {
    const editorFields = {
      createdByUserId: input.createdByUserId ?? null,
      createdByDisplayName: input.createdByDisplayName ?? null,
      updatedByUserId: input.updatedByUserId ?? input.createdByUserId ?? null,
      updatedByDisplayName: input.updatedByDisplayName ?? input.createdByDisplayName ?? null,
    }
    const outTxId = await addTransaction(ledgerId, {
      type: 'transfer',
      transferGroupId,
      accountId: input.fromAccountId,
      peerAccountId: input.toAccountId,
      amountMinor: legs.outAmountMinor,
      occurredAt,
      note: input.note,
      originType: input.originType ?? 'manual',
      externalRefId: input.externalRefId ?? null,
      idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:out` : null,
      ...editorFields,
    })

    const inTxId = await addTransaction(ledgerId, {
      type: 'transfer',
      transferGroupId,
      accountId: input.toAccountId,
      peerAccountId: input.fromAccountId,
      amountMinor: legs.toAmountMinor,
      occurredAt,
      note: input.note,
      originType: input.originType ?? 'manual',
      externalRefId: input.externalRefId ?? null,
      idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:in` : null,
      ...editorFields,
    })

    return { transferGroupId, outTxId, inTxId }
  })
}

export async function batchPatchCategoryForTransactions(ledgerId, txIds, categoryId, editor = null) {
  assertLedgerId(ledgerId)
  if (!Array.isArray(txIds) || txIds.length === 0) return 0

  const now = nowIso()
  const updatedByUserId = editor?.userId ?? null
  const updatedByDisplayName = editor?.displayName ?? null
  let updated = 0
  for (const txId of txIds) {
    await run(
      `UPDATE transactions
       SET category_id = ?,
           updated_by_user_id = COALESCE(?, updated_by_user_id),
           updated_by_display_name = COALESCE(?, updated_by_display_name),
           updated_at = ?
       WHERE ledger_id = ?
         AND id = ?
         AND deleted_at IS NULL
         AND type NOT IN ('transfer', 'adjustment');`,
      [categoryId ?? null, updatedByUserId, updatedByDisplayName, now, ledgerId, txId],
    )
    updated += 1
  }
  return updated
}
