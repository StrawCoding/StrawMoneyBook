import { query, run, withTransaction } from '@/core/db/sqlite'
import { createId, nowIso } from '@/core/utils/id'
import { assertLedgerId, firstRow, rowsOf } from '@/core/repositories/base.repo'
import { yieldToMainThread } from '@/core/utils/cooperative-yield'


function monthRangeUtc(monthKey) {
  const [year, month] = monthKey.split('-').map((part) => Number(part))
  const start = new Date(year, month - 1, 1, 0, 0, 0)
  const end = new Date(year, month, 1, 0, 0, 0)

  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  }
}

function yearRangeUtc(yearKey) {
  const year = Number(yearKey)
  const start = new Date(year, 0, 1, 0, 0, 0)
  const end = new Date(year + 1, 0, 1, 0, 0, 0)
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  }
}

function dayRangeUtc(dayKey) {
  const [year, month, day] = String(dayKey ?? '').split('-').map((part) => Number(part))
  const start = new Date(year, month - 1, day, 0, 0, 0)
  const end = new Date(year, month - 1, day + 1, 0, 0, 0)
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  }
}

function refundRelationExistsSql(sourceAlias = 't') {
  return `EXISTS (
    SELECT 1
    FROM transactions rt
    LEFT JOIN categories rc
      ON rc.ledger_id = rt.ledger_id
     AND rc.id = rt.category_id
    WHERE rt.ledger_id = ${sourceAlias}.ledger_id
      AND rt.deleted_at IS NULL
      AND rt.external_ref_id = ${sourceAlias}.id
      AND (
        rt.origin_type = 'refund'
        OR rc.name = '退款'
        OR rt.note LIKE '退款：%'
        OR rt.note LIKE '退款:%'
      )
  )`
}

function refundDeductedMinorSql(sourceAlias = 't') {
  return `COALESCE((
    SELECT SUM(ABS(rt.amount_minor))
    FROM transactions rt
    LEFT JOIN categories rc
      ON rc.ledger_id = rt.ledger_id
     AND rc.id = rt.category_id
    WHERE rt.ledger_id = ${sourceAlias}.ledger_id
      AND rt.deleted_at IS NULL
      AND rt.external_ref_id = ${sourceAlias}.id
      AND (
        rt.origin_type = 'refund'
        OR rc.name = '退款'
        OR rt.note LIKE '退款：%'
        OR rt.note LIKE '退款:%'
      )
  ), 0)`
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

function transactionListSelectSql() {
  return `SELECT t.ledger_id, t.id, t.type, t.transfer_group_id, t.account_id, t.peer_account_id,
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
      AND c.id = t.category_id`
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

  const { startUtc, endUtc } = monthRangeUtc(monthKey)
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
  const { startUtc, endUtc } = yearRangeUtc(yearKey)
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
  const { startUtc, endUtc } = dayRangeUtc(dayKey)
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
       LEFT JOIN accounts a
         ON a.ledger_id = t.ledger_id
        AND a.id = t.account_id
       LEFT JOIN categories c
         ON c.ledger_id = t.ledger_id
        AND c.id = t.category_id
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
         idempotency_key = NULL,
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
         idempotency_key = NULL,
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
         idempotency_key = NULL,
         updated_at = ?
     WHERE ledger_id = ?
       AND origin_type = ?
       AND external_ref_id = ?
       AND deleted_at IS NULL;`,
    [now, now, ledgerId, String(originType ?? ''), String(externalRefId ?? '')],
  )
}

export async function addTransaction(ledgerId, input) {
  assertLedgerId(ledgerId)

  const id = input.id ?? createId('tx')
  const now = nowIso()

  await run(
    `INSERT INTO transactions (
      ledger_id, id, type, transfer_group_id, account_id, peer_account_id,
      category_id, amount_minor, occurred_at, note, location, tags_json, origin_type,
      external_ref_id, idempotency_key, is_reimbursable, reimbursement_state,
      reimbursed_at, include_in_budget, include_in_analysis, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
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
      input.note ?? null,
      input.location ?? null,
      input.tagsJson ?? null,
      input.originType ?? 'manual',
      input.externalRefId ?? null,
      input.idempotencyKey ?? null,
      input.isReimbursable ? 1 : 0,
      input.reimbursementState ?? 'none',
      input.reimbursedAt ?? null,
      input.includeInBudget === false ? 0 : 1,
      input.includeInAnalysis === false ? 0 : 1,
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
  const amountMinor = Math.abs(Number(input.amountMinor))
  const toAmountMinorInput = Number(input.toAmountMinor)
  const toAmountMinor = Number.isFinite(toAmountMinorInput) && toAmountMinorInput > 0
    ? Math.abs(Math.round(toAmountMinorInput))
    : amountMinor
  const sourceExtraMinorInput = Number(input.sourceExtraMinor ?? 0)
  const sourceExtraMinor = Number.isFinite(sourceExtraMinorInput) ? Math.round(sourceExtraMinorInput) : 0
  const outAmountMinor = (amountMinor + sourceExtraMinor) * -1

  return withTransaction(async () => {
    const outTxId = await addTransaction(ledgerId, {
      type: 'transfer',
      transferGroupId,
      accountId: input.fromAccountId,
      peerAccountId: input.toAccountId,
      amountMinor: outAmountMinor,
      occurredAt,
      note: input.note,
      originType: input.originType ?? 'manual',
      externalRefId: input.externalRefId ?? null,
      idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:out` : null,
    })

    const inTxId = await addTransaction(ledgerId, {
      type: 'transfer',
      transferGroupId,
      accountId: input.toAccountId,
      peerAccountId: input.fromAccountId,
      amountMinor: toAmountMinor,
      occurredAt,
      note: input.note,
      originType: input.originType ?? 'manual',
      externalRefId: input.externalRefId ?? null,
      idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:in` : null,
    })

    return { transferGroupId, outTxId, inTxId }
  })
}

export async function batchPatchCategoryForTransactions(ledgerId, txIds, categoryId) {
  assertLedgerId(ledgerId)
  if (!Array.isArray(txIds) || txIds.length === 0) return 0

  const now = nowIso()
  let updated = 0
  for (const txId of txIds) {
    await run(
      `UPDATE transactions
       SET category_id = ?,
           updated_at = ?
       WHERE ledger_id = ?
         AND id = ?
         AND deleted_at IS NULL
         AND type NOT IN ('transfer', 'adjustment');`,
      [categoryId ?? null, now, ledgerId, txId],
    )
    updated += 1
  }
  return updated
}
