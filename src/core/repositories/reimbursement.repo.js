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
       i.entry_type,
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
      entry_type, category_id, account_id, description, amount_minor,
      occurred_at, attachment_uri, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      ledgerId,
      id,
      input.reimbursementId,
      input.sourceType ?? 'manual',
      input.transactionId ?? null,
      input.entryType ?? 'expense',
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

export async function listReimbursementAdvances(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const activeOnly = options?.activeOnly !== false

  const result = await query(
    `SELECT
       ra.ledger_id,
       ra.id,
       ra.account_id,
       a.name AS account_name,
       ra.category_id,
       c.name AS category_name,
       c.icon AS category_icon,
       ra.source_tx_id,
       ra.amount_minor,
       ra.used_minor,
       MAX(0, ra.amount_minor - ra.used_minor) AS available_minor,
       ra.note,
       ra.received_at,
       ra.created_at,
       ra.updated_at
     FROM reimbursement_advances ra
     LEFT JOIN accounts a
       ON a.ledger_id = ra.ledger_id
      AND a.id = ra.account_id
     LEFT JOIN categories c
       ON c.ledger_id = ra.ledger_id
      AND c.id = ra.category_id
     WHERE ra.ledger_id = ?
       AND ra.deleted_at IS NULL
       AND (? = 0 OR ra.amount_minor > ra.used_minor)
     ORDER BY ra.received_at DESC, ra.created_at DESC;`,
    [ledgerId, activeOnly ? 1 : 0],
  )

  return rowsOf(result)
}

export async function getReimbursementAdvanceById(ledgerId, advanceId) {
  assertLedgerId(ledgerId)

  const result = await query(
    `SELECT
       ra.ledger_id,
       ra.id,
       ra.account_id,
       a.name AS account_name,
       ra.category_id,
       c.name AS category_name,
       c.icon AS category_icon,
       ra.source_tx_id,
       ra.amount_minor,
       ra.used_minor,
       MAX(0, ra.amount_minor - ra.used_minor) AS available_minor,
       ra.note,
       ra.received_at,
       ra.created_at,
       ra.updated_at
     FROM reimbursement_advances ra
     LEFT JOIN accounts a
       ON a.ledger_id = ra.ledger_id
      AND a.id = ra.account_id
     LEFT JOIN categories c
       ON c.ledger_id = ra.ledger_id
      AND c.id = ra.category_id
     WHERE ra.ledger_id = ?
       AND ra.id = ?
       AND ra.deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, advanceId],
  )

  return firstRow(result)
}

export async function createReimbursementAdvance(ledgerId, input) {
  assertLedgerId(ledgerId)

  const id = input.id ?? createId('radv')
  const now = nowIso()

  await run(
    `INSERT INTO reimbursement_advances (
      ledger_id, id, account_id, category_id, source_tx_id, amount_minor, used_minor,
      note, received_at, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NULL);`,
    [
      ledgerId,
      id,
      input.accountId,
      input.categoryId ?? null,
      input.sourceTxId ?? null,
      input.amountMinor,
      input.note ?? null,
      input.receivedAt,
      now,
      now,
    ],
  )

  return getReimbursementAdvanceById(ledgerId, id)
}

export async function updateReimbursementAdvanceUsedMinor(ledgerId, advanceId, usedMinor) {
  assertLedgerId(ledgerId)

  await run(
    `UPDATE reimbursement_advances
     SET used_minor = ?,
         updated_at = ?
     WHERE ledger_id = ?
       AND id = ?
       AND deleted_at IS NULL;`,
    [usedMinor, nowIso(), ledgerId, advanceId],
  )

  return getReimbursementAdvanceById(ledgerId, advanceId)
}

export async function listReimbursementAdvanceUsagesByExpenseTx(ledgerId, expenseTxId) {
  assertLedgerId(ledgerId)

  const result = await query(
    `SELECT
       u.ledger_id,
       u.id,
       u.advance_id,
       u.expense_tx_id,
       u.amount_minor,
       u.created_at,
       u.updated_at,
       ra.account_id,
       a.name AS account_name,
       ra.note AS advance_note
     FROM reimbursement_advance_usages u
     LEFT JOIN reimbursement_advances ra
       ON ra.ledger_id = u.ledger_id
      AND ra.id = u.advance_id
     LEFT JOIN accounts a
       ON a.ledger_id = ra.ledger_id
      AND a.id = ra.account_id
     WHERE u.ledger_id = ?
       AND u.expense_tx_id = ?
     ORDER BY u.created_at ASC;`,
    [ledgerId, expenseTxId],
  )

  return rowsOf(result)
}

export async function createReimbursementAdvanceUsage(ledgerId, input) {
  assertLedgerId(ledgerId)

  const id = input.id ?? createId('rau')
  const now = nowIso()

  await run(
    `INSERT INTO reimbursement_advance_usages (
      ledger_id, id, advance_id, expense_tx_id, amount_minor, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [ledgerId, id, input.advanceId, input.expenseTxId, input.amountMinor, now, now],
  )

  return id
}

export async function deleteReimbursementAdvanceUsagesByExpenseTx(ledgerId, expenseTxId) {
  assertLedgerId(ledgerId)

  await run(
    `DELETE FROM reimbursement_advance_usages
     WHERE ledger_id = ?
       AND expense_tx_id = ?;`,
    [ledgerId, expenseTxId],
  )
}

export async function recomputeReimbursementTotal(ledgerId, reimbursementId) {
  assertLedgerId(ledgerId)

  await run(
    `UPDATE reimbursements
     SET total_minor = (
           SELECT COALESCE(SUM(
             CASE
               WHEN entry_type = 'income' THEN amount_minor * -1
               ELSE amount_minor
             END
           ), 0)
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

export async function deleteReimbursementById(ledgerId, reimbursementId) {
  assertLedgerId(ledgerId)
  const now = nowIso()

  await run(
    `UPDATE reimbursements
     SET deleted_at = ?,
         updated_at = ?
     WHERE ledger_id = ?
       AND id = ?
       AND deleted_at IS NULL;`,
    [now, now, ledgerId, reimbursementId],
  )
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
