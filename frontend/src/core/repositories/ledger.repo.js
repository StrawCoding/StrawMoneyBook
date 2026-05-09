import { query, run } from '../db/sqlite.js'
import { createId, nowIso } from '../utils/id.js'
import { firstRow, rowsOf } from './base.repo.js'

const LEGACY_LEDGER_CHILD_DELETE_ORDER = [
  'transaction_attachments',
  'loan_payments',
  'reimbursement_advance_usages',
  'reimbursement_advances',
  'reimbursement_items',
  'reimbursements',
  'budget_save_settlements',
  'budget_items',
  'budget_containers',
  'budgets',
  'loans',
  'transactions',
  'savings_jars',
  'accounts',
  'account_groups',
  'categories',
  'category_groups',
  'counterparties',
  'app_settings',
  'deleted_log',
]

function isForeignKeyError(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase()
  return message.includes('foreign key')
}

export async function listLedgers() {
  const result = await query(
    `SELECT id, name, currency_code, timezone, color, icon, sort_order, is_archived, created_at, updated_at
     FROM ledgers
     WHERE deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC;`,
  )
  return rowsOf(result)
}

export async function getLedger(ledgerId) {
  const result = await query(
    `SELECT id, name, currency_code, timezone, color, icon, sort_order, is_archived, created_at, updated_at
     FROM ledgers
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId],
  )
  return firstRow(result)
}

export async function createLedger(input) {
  const id = input.id ?? createId('ledger')
  const now = nowIso()
  const orderResult = await query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM ledgers WHERE deleted_at IS NULL;')
  const nextSortOrder = Number(firstRow(orderResult)?.next_order ?? 0)

  await run(
    `INSERT INTO ledgers (
      id, name, currency_code, timezone, color, icon, sort_order, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?);`,
    [
      id,
      input.name,
      input.currencyCode ?? 'TWD',
      input.timezone ?? 'Asia/Taipei',
      input.color ?? null,
      input.icon ?? null,
      input.sortOrder ?? nextSortOrder,
      now,
      now,
    ],
  )

  return getLedger(id)
}

export async function renameLedger(ledgerId, name) {
  await run('UPDATE ledgers SET name = ?, updated_at = ? WHERE id = ?;', [name, nowIso(), ledgerId])
  return getLedger(ledgerId)
}

export async function updateLedgerSortOrders(ledgerIds = []) {
  if (!Array.isArray(ledgerIds) || ledgerIds.length === 0) return
  const now = nowIso()
  for (let index = 0; index < ledgerIds.length; index += 1) {
    const ledgerId = ledgerIds[index]
    if (!ledgerId) continue
    await run(
      `UPDATE ledgers
       SET sort_order = ?, updated_at = ?
       WHERE id = ?;`,
      [index, now, ledgerId],
    )
  }
}

export async function deleteLedger(ledgerId) {
  const now = nowIso()
  try {
    await run(
      `UPDATE ledgers
       SET deleted_at = ?, is_archived = 1, updated_at = ?
       WHERE id = ?;`,
      [now, now, ledgerId],
    )
  } catch (error) {
    if (!isForeignKeyError(error)) throw error

    // Legacy DB fallback: explicitly clear child rows then delete ledger.
    for (const table of LEGACY_LEDGER_CHILD_DELETE_ORDER) {
      await run(`DELETE FROM ${table} WHERE ledger_id = ?;`, [ledgerId])
    }
    await run('DELETE FROM ledgers WHERE id = ?;', [ledgerId])
    await run('DELETE FROM deleted_log WHERE ledger_id = ?;', [ledgerId])
  }
}

export async function purgeLedger(ledgerId) {
  try {
    await run('DELETE FROM ledgers WHERE id = ?;', [ledgerId])
    await run('DELETE FROM deleted_log WHERE ledger_id = ?;', [ledgerId])
  } catch (error) {
    if (!isForeignKeyError(error)) throw error

    for (const table of LEGACY_LEDGER_CHILD_DELETE_ORDER) {
      await run(`DELETE FROM ${table} WHERE ledger_id = ?;`, [ledgerId])
    }
    await run('DELETE FROM ledgers WHERE id = ?;', [ledgerId])
    await run('DELETE FROM deleted_log WHERE ledger_id = ?;', [ledgerId])
  }
}
