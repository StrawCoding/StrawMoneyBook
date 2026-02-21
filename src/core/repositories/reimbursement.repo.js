import { query, run } from '@/core/db/sqlite'
import { createId, nowIso } from '@/core/utils/id'
import { assertLedgerId, firstRow, rowsOf } from '@/core/repositories/base.repo'

export async function listReimbursements(ledgerId) {
  assertLedgerId(ledgerId)

  const result = await query(
    `SELECT
       r.ledger_id,
       r.id,
       r.title,
       r.counterparty_id,
       c.name AS counterparty_name,
       r.status,
       r.total_minor,
       r.paid_tx_id,
       r.created_at,
       r.updated_at,
       COUNT(ri.id) AS item_count
     FROM reimbursements r
     LEFT JOIN counterparties c
       ON c.ledger_id = r.ledger_id
      AND c.id = r.counterparty_id
     LEFT JOIN reimbursement_items ri
       ON ri.ledger_id = r.ledger_id
      AND ri.reimbursement_id = r.id
     WHERE r.ledger_id = ?
       AND r.deleted_at IS NULL
     GROUP BY r.ledger_id, r.id
     ORDER BY r.updated_at DESC;`,
    [ledgerId],
  )

  return rowsOf(result)
}

export async function countReimbursements(ledgerId) {
  assertLedgerId(ledgerId)

  const result = await query(
    `SELECT COUNT(*) AS total
     FROM reimbursements
     WHERE ledger_id = ?
       AND deleted_at IS NULL;`,
    [ledgerId],
  )

  return Number(firstRow(result)?.total ?? 0)
}

export async function getReimbursementById(ledgerId, reimbursementId) {
  assertLedgerId(ledgerId)

  const result = await query(
    `SELECT
       r.ledger_id,
       r.id,
       r.title,
       r.counterparty_id,
       c.name AS counterparty_name,
       r.status,
       r.total_minor,
       r.note,
       r.submitted_at,
       r.approved_at,
       r.paid_at,
       r.paid_tx_id,
       r.idempotency_key,
       r.created_at,
       r.updated_at
     FROM reimbursements r
     LEFT JOIN counterparties c
       ON c.ledger_id = r.ledger_id
      AND c.id = r.counterparty_id
     WHERE r.ledger_id = ?
       AND r.id = ?
       AND r.deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, reimbursementId],
  )

  return firstRow(result)
}

export async function createReimbursement(ledgerId, input) {
  assertLedgerId(ledgerId)

  const id = input.id ?? createId('reim')
  const now = nowIso()

  await run(
    `INSERT INTO reimbursements (
      ledger_id, id, title, counterparty_id, status,
      submitted_at, approved_at, paid_at, paid_tx_id,
      total_minor, note, idempotency_key,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, ?, NULL, ?, ?);`,
    [ledgerId, id, input.title, input.counterpartyId ?? null, input.status ?? 'draft', input.note ?? null, now, now],
  )

  return getReimbursementById(ledgerId, id)
}

export async function listReimbursementItems(ledgerId, reimbursementId) {
  assertLedgerId(ledgerId)

  const result = await query(
    `SELECT
       i.ledger_id,
       i.id,
       i.reimbursement_id,
       i.source_type,
       i.transaction_id,
       i.category_id,
       i.account_id,
       i.description,
       i.amount_minor,
       i.occurred_at,
       i.attachment_uri,
       i.created_at,
       t.note AS transaction_note
     FROM reimbursement_items i
     LEFT JOIN transactions t
       ON t.ledger_id = i.ledger_id
      AND t.id = i.transaction_id
     WHERE i.ledger_id = ?
       AND i.reimbursement_id = ?
     ORDER BY i.created_at ASC;`,
    [ledgerId, reimbursementId],
  )

  return rowsOf(result)
}

export async function createReimbursementItem(ledgerId, input) {
  assertLedgerId(ledgerId)

  const id = input.id ?? createId('ri')
  const now = nowIso()

  await run(
    `INSERT INTO reimbursement_items (
      ledger_id, id, reimbursement_id, source_type, transaction_id,
      category_id, account_id, description, amount_minor,
      occurred_at, attachment_uri, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      ledgerId,
      id,
      input.reimbursementId,
      input.sourceType ?? 'manual',
      input.transactionId ?? null,
      input.categoryId ?? null,
      input.accountId ?? null,
      input.description ?? null,
      input.amountMinor,
      input.occurredAt,
      input.attachmentUri ?? null,
      now,
      now,
    ],
  )

  return id
}

export async function recomputeReimbursementTotal(ledgerId, reimbursementId) {
  assertLedgerId(ledgerId)

  await run(
    `UPDATE reimbursements
     SET total_minor = (
           SELECT COALESCE(SUM(amount_minor), 0)
           FROM reimbursement_items
           WHERE ledger_id = ?
             AND reimbursement_id = ?
         ),
         updated_at = ?
     WHERE ledger_id = ?
       AND id = ?;`,
    [ledgerId, reimbursementId, nowIso(), ledgerId, reimbursementId],
  )

  return getReimbursementById(ledgerId, reimbursementId)
}

export async function updateReimbursementStatus(ledgerId, reimbursementId, nextStatus) {
  assertLedgerId(ledgerId)
  const now = nowIso()

  const values = [nextStatus, now]
  let sql = `
    UPDATE reimbursements
    SET status = ?,
        updated_at = ?
    WHERE ledger_id = ?
      AND id = ?;
  `

  if (nextStatus === 'submitted') {
    sql = `
      UPDATE reimbursements
      SET status = ?,
          submitted_at = COALESCE(submitted_at, ?),
          updated_at = ?
      WHERE ledger_id = ?
        AND id = ?;
    `
    values.splice(1, 0, now)
  }

  if (nextStatus === 'approved') {
    sql = `
      UPDATE reimbursements
      SET status = ?,
          submitted_at = COALESCE(submitted_at, ?),
          approved_at = ?,
          updated_at = ?
      WHERE ledger_id = ?
        AND id = ?;
    `
    values.splice(1, 0, now, now)
  }

  if (nextStatus === 'rejected') {
    sql = `
      UPDATE reimbursements
      SET status = ?,
          updated_at = ?
      WHERE ledger_id = ?
        AND id = ?;
    `
  }

  await run(sql, [...values, ledgerId, reimbursementId])

  return getReimbursementById(ledgerId, reimbursementId)
}

export async function setReimbursementPaid(ledgerId, reimbursementId, input) {
  assertLedgerId(ledgerId)
  const now = nowIso()

  await run(
    `UPDATE reimbursements
     SET status = 'paid',
         paid_at = ?,
         paid_tx_id = ?,
         idempotency_key = ?,
         updated_at = ?
     WHERE ledger_id = ?
       AND id = ?;`,
    [now, input.paidTxId, input.idempotencyKey, now, ledgerId, reimbursementId],
  )

  return getReimbursementById(ledgerId, reimbursementId)
}

export async function findTransactionByIdempotencyKey(ledgerId, idempotencyKey) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT id, type, amount_minor, occurred_at
     FROM transactions
     WHERE ledger_id = ?
       AND idempotency_key = ?
       AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, idempotencyKey],
  )

  return firstRow(result)
}
