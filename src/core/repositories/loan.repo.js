import { query, run } from '@/core/db/sqlite'
import { createId, nowIso } from '@/core/utils/id'
import { assertLedgerId, firstRow, rowsOf } from '@/core/repositories/base.repo'

export async function listLoans(ledgerId) {
  assertLedgerId(ledgerId)

  const result = await query(
    `SELECT
       l.ledger_id,
       l.id,
       l.counterparty_id,
       c.name AS counterparty_name,
       l.direction,
       l.principal_minor,
       l.start_date,
       l.due_date,
       l.status,
       l.note,
       l.created_at,
       COALESCE(SUM(lp.amount_minor), 0) AS paid_minor,
       l.principal_minor - COALESCE(SUM(lp.amount_minor), 0) AS remaining_minor
     FROM loans l
     LEFT JOIN counterparties c
       ON c.ledger_id = l.ledger_id
      AND c.id = l.counterparty_id
     LEFT JOIN loan_payments lp
       ON lp.ledger_id = l.ledger_id
      AND lp.loan_id = l.id
     WHERE l.ledger_id = ?
       AND l.deleted_at IS NULL
     GROUP BY l.ledger_id, l.id
     ORDER BY l.created_at DESC;`,
    [ledgerId],
  )

  return rowsOf(result)
}

export async function countLoans(ledgerId) {
  assertLedgerId(ledgerId)

  const result = await query(
    `SELECT COUNT(*) AS total
     FROM loans
     WHERE ledger_id = ?
       AND deleted_at IS NULL;`,
    [ledgerId],
  )

  return Number(firstRow(result)?.total ?? 0)
}

export async function getLoanById(ledgerId, loanId) {
  assertLedgerId(ledgerId)

  const result = await query(
    `SELECT
       l.ledger_id,
       l.id,
       l.counterparty_id,
       c.name AS counterparty_name,
       l.direction,
       l.principal_minor,
       l.start_date,
       l.due_date,
       l.status,
       l.note,
       l.created_at,
       l.updated_at,
       l.settled_at,
       COALESCE(SUM(lp.amount_minor), 0) AS paid_minor,
       l.principal_minor - COALESCE(SUM(lp.amount_minor), 0) AS remaining_minor
     FROM loans l
     LEFT JOIN counterparties c
       ON c.ledger_id = l.ledger_id
      AND c.id = l.counterparty_id
     LEFT JOIN loan_payments lp
       ON lp.ledger_id = l.ledger_id
      AND lp.loan_id = l.id
     WHERE l.ledger_id = ?
       AND l.id = ?
       AND l.deleted_at IS NULL
     GROUP BY l.ledger_id, l.id
     LIMIT 1;`,
    [ledgerId, loanId],
  )

  return firstRow(result)
}

export async function createLoan(ledgerId, input) {
  assertLedgerId(ledgerId)

  const id = input.id ?? createId('loan')
  const now = nowIso()

  await run(
    `INSERT INTO loans (
      ledger_id, id, counterparty_id, direction, principal_minor,
      interest_rule_json, start_date, due_date, status, settled_at,
      note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?);`,
    [
      ledgerId,
      id,
      input.counterpartyId,
      input.direction,
      input.principalMinor,
      input.interestRuleJson ?? null,
      input.startDate,
      input.dueDate ?? null,
      input.status ?? 'active',
      input.note ?? null,
      now,
      now,
    ],
  )

  return getLoanById(ledgerId, id)
}

export async function listLoanPayments(ledgerId, loanId) {
  assertLedgerId(ledgerId)

  const result = await query(
    `SELECT
       p.ledger_id,
       p.id,
       p.loan_id,
       p.account_id,
       a.name AS account_name,
       p.paid_at,
       p.amount_minor,
       p.generated_tx_id,
       p.note,
       p.created_at
     FROM loan_payments p
     LEFT JOIN accounts a
       ON a.ledger_id = p.ledger_id
      AND a.id = p.account_id
     WHERE p.ledger_id = ?
       AND p.loan_id = ?
     ORDER BY p.paid_at DESC, p.created_at DESC;`,
    [ledgerId, loanId],
  )

  return rowsOf(result)
}

export async function sumLoanPayments(ledgerId, loanId) {
  const result = await query(
    `SELECT COALESCE(SUM(amount_minor), 0) AS total_minor
     FROM loan_payments
     WHERE ledger_id = ?
       AND loan_id = ?;`,
    [ledgerId, loanId],
  )

  return Number(firstRow(result)?.total_minor ?? 0)
}

export async function createLoanPayment(ledgerId, input) {
  assertLedgerId(ledgerId)

  const id = input.id ?? createId('lp')
  const now = nowIso()

  await run(
    `INSERT INTO loan_payments (
      ledger_id, id, loan_id, account_id, paid_at, amount_minor,
      principal_component_minor, interest_component_minor, generated_tx_id,
      note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      ledgerId,
      id,
      input.loanId,
      input.accountId,
      input.paidAt,
      input.amountMinor,
      input.principalComponentMinor ?? null,
      input.interestComponentMinor ?? null,
      input.generatedTxId ?? null,
      input.note ?? null,
      now,
      now,
    ],
  )

  return id
}

export async function updateLoanStatus(ledgerId, loanId, status, options = {}) {
  assertLedgerId(ledgerId)

  await run(
    `UPDATE loans
     SET status = ?,
         settled_at = ?,
         updated_at = ?
     WHERE ledger_id = ?
       AND id = ?;`,
    [status, options.settledAt ?? null, nowIso(), ledgerId, loanId],
  )

  return getLoanById(ledgerId, loanId)
}
