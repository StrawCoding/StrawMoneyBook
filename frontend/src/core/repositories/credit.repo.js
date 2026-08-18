import { createId } from '@/core/utils/id'
import { assertLedgerId, rowsOf, firstRow } from '@/core/repositories/base.repo'
import { query, run, withTransaction } from '@/core/db/sqlite'

function nowIso() {
  return new Date().toISOString()
}

export async function listCreditAccounts(ledgerId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT a.*
     FROM accounts a
     WHERE a.ledger_id = ?
       AND a.deleted_at IS NULL
       AND a.is_archived = 0
       AND a.account_kind = 'credit'
     ORDER BY a.sort_order ASC, a.name COLLATE NOCASE ASC;`,
    [ledgerId],
  )
  return rowsOf(result)
}

export async function findCreditStatementById(ledgerId, statementId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT * FROM credit_statements
     WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, String(statementId)],
  )
  return firstRow(result)
}

export async function findOpenCreditStatement(ledgerId, accountId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT * FROM credit_statements
     WHERE ledger_id = ? AND account_id = ? AND status = 'open' AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, String(accountId)],
  )
  return firstRow(result)
}

export async function findStatementForPostedAt(ledgerId, accountId, postedAt) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT * FROM credit_statements
     WHERE ledger_id = ?
       AND account_id = ?
       AND deleted_at IS NULL
       AND period_start_inclusive <= ?
       AND period_end_exclusive > ?
     ORDER BY period_start_inclusive DESC
     LIMIT 1;`,
    [ledgerId, String(accountId), String(postedAt), String(postedAt)],
  )
  return firstRow(result)
}

export async function listCreditStatements(ledgerId, accountId, { limit = 24 } = {}) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT * FROM credit_statements
     WHERE ledger_id = ? AND account_id = ? AND deleted_at IS NULL
     ORDER BY period_start_inclusive DESC
     LIMIT ?;`,
    [ledgerId, String(accountId), Math.max(1, Math.min(100, Number(limit) || 24))],
  )
  return rowsOf(result)
}

export async function insertCreditStatement(ledgerId, input) {
  assertLedgerId(ledgerId)
  const id = input.id ?? createId('cst')
  const now = nowIso()
  await run(
    `INSERT INTO credit_statements (
      ledger_id, id, account_id, period_start_inclusive, period_end_exclusive,
      status, closing_balance_minor, due_on, closed_at, closing_hash, close_token,
      created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
    [
      ledgerId,
      id,
      input.accountId,
      input.periodStartInclusive,
      input.periodEndExclusive,
      input.status ?? 'open',
      input.closingBalanceMinor ?? null,
      input.dueOn ?? null,
      input.closedAt ?? null,
      input.closingHash ?? null,
      input.closeToken ?? null,
      now,
      now,
    ],
  )
  return id
}

export async function closeCreditStatementRow(ledgerId, statementId, patch) {
  assertLedgerId(ledgerId)
  await run(
    `UPDATE credit_statements
     SET status = 'closed',
         closing_balance_minor = ?,
         due_on = ?,
         closed_at = ?,
         closing_hash = ?,
         close_token = ?,
         updated_at = ?
     WHERE ledger_id = ? AND id = ? AND status = 'open' AND deleted_at IS NULL;`,
    [
      patch.closingBalanceMinor,
      patch.dueOn,
      patch.closedAt,
      patch.closingHash,
      patch.closeToken,
      nowIso(),
      ledgerId,
      String(statementId),
    ],
  )
}

export async function sumCardLiabilityForStatement(ledgerId, statementId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT COALESCE(SUM(p.amount_minor), 0) AS total
     FROM transaction_postings p
     INNER JOIN transactions t
       ON t.ledger_id = p.ledger_id
      AND t.id = p.transaction_id
     WHERE p.ledger_id = ?
       AND p.statement_id = ?
       AND p.role IN ('card_liability', 'adjustment', 'reversal', 'fee')
       AND p.deleted_at IS NULL
       AND t.deleted_at IS NULL;`,
    [ledgerId, String(statementId)],
  )
  // Liability postings are negative amounts (debt increase). Closing owed = -sum.
  const sum = Math.round(Number(firstRow(result)?.total ?? 0))
  return -sum
}

export async function sumAllocationsForStatement(ledgerId, statementId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT COALESCE(SUM(amount_minor), 0) AS total
     FROM credit_repayment_allocations
     WHERE ledger_id = ? AND statement_id = ? AND deleted_at IS NULL;`,
    [ledgerId, String(statementId)],
  )
  return Math.round(Number(firstRow(result)?.total ?? 0))
}

export async function listAllocationsForStatement(ledgerId, statementId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT * FROM credit_repayment_allocations
     WHERE ledger_id = ? AND statement_id = ? AND deleted_at IS NULL;`,
    [ledgerId, String(statementId)],
  )
  return rowsOf(result)
}

export async function findRepaymentByIdempotency(ledgerId, idempotencyKey) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT * FROM credit_repayments
     WHERE ledger_id = ? AND idempotency_key = ? AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, String(idempotencyKey)],
  )
  return firstRow(result)
}

export async function insertCreditRepayment(ledgerId, input) {
  assertLedgerId(ledgerId)
  const id = input.id ?? createId('crp')
  const now = nowIso()
  await run(
    `INSERT INTO credit_repayments (
      ledger_id, id, account_id, source_account_id, amount_minor, paid_at,
      transfer_group_id, idempotency_key, note, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
    [
      ledgerId,
      id,
      input.accountId,
      input.sourceAccountId,
      input.amountMinor,
      input.paidAt,
      input.transferGroupId ?? null,
      input.idempotencyKey,
      input.note ?? null,
      now,
      now,
    ],
  )
  return id
}

export async function insertCreditAllocation(ledgerId, input) {
  assertLedgerId(ledgerId)
  const id = input.id ?? createId('cra')
  const now = nowIso()
  await run(
    `INSERT INTO credit_repayment_allocations (
      ledger_id, id, repayment_id, statement_id, amount_minor,
      created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL);`,
    [
      ledgerId,
      id,
      input.repaymentId,
      input.statementId,
      input.amountMinor,
      now,
      now,
    ],
  )
  return id
}

export async function listAllocationsForRepayment(ledgerId, repaymentId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT * FROM credit_repayment_allocations
     WHERE ledger_id = ? AND repayment_id = ? AND deleted_at IS NULL;`,
    [ledgerId, String(repaymentId)],
  )
  return rowsOf(result)
}

export async function insertTransactionPosting(ledgerId, input) {
  assertLedgerId(ledgerId)
  const id = input.id ?? createId('pst')
  const now = nowIso()
  await run(
    `INSERT INTO transaction_postings (
      ledger_id, id, transaction_id, role, account_id, category_id, amount_minor,
      statement_id, include_in_budget, include_in_analysis, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
    [
      ledgerId,
      id,
      input.transactionId,
      input.role,
      input.accountId ?? null,
      input.categoryId ?? null,
      input.amountMinor,
      input.statementId ?? null,
      input.includeInBudget ? 1 : 0,
      input.includeInAnalysis ? 1 : 0,
      now,
      now,
    ],
  )
  return id
}

export async function listPostingsForTransaction(ledgerId, transactionId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT * FROM transaction_postings
     WHERE ledger_id = ? AND transaction_id = ? AND deleted_at IS NULL;`,
    [ledgerId, String(transactionId)],
  )
  return rowsOf(result)
}

export async function findPostingStatementStatus(ledgerId, transactionId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT s.status, s.id AS statement_id
     FROM transaction_postings p
     JOIN credit_statements s
       ON s.ledger_id = p.ledger_id AND s.id = p.statement_id AND s.deleted_at IS NULL
     WHERE p.ledger_id = ? AND p.transaction_id = ? AND p.deleted_at IS NULL
       AND p.statement_id IS NOT NULL
     LIMIT 1;`,
    [ledgerId, String(transactionId)],
  )
  return firstRow(result)
}

export async function listUnpaidStatementsFifo(ledgerId, accountId) {
  assertLedgerId(ledgerId)
  const statements = await listCreditStatements(ledgerId, accountId, { limit: 48 })
  const withPaid = []
  for (const st of statements) {
    const paid = await sumAllocationsForStatement(ledgerId, st.id)
    const closing = st.status === 'closed'
      ? Math.round(Number(st.closing_balance_minor ?? 0))
      : await sumCardLiabilityForStatement(ledgerId, st.id)
    const remaining = Math.max(0, closing - paid)
    withPaid.push({ ...st, paid_minor: paid, remaining_minor: remaining })
  }
  // FIFO: oldest unpaid closed first, then open
  return withPaid
    .filter((s) => s.remaining_minor > 0)
    .sort((a, b) => String(a.period_start_inclusive).localeCompare(String(b.period_start_inclusive)))
}

export { withTransaction, nowIso }
