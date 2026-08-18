import { query, run, withTransaction } from '../db/sqlite.js'
import { createId, nowIso } from '../utils/id.js'
import { LEDGER_CHILD_DELETE_ORDER } from '../utils/sqlite-delete-order.js'
import { isForeignKeyError } from '../utils/sqlite-fk.js'
import { firstRow, rowsOf } from './base.repo.js'

export async function listLedgers() {
  const result = await query(
    `SELECT id, name, currency_code, timezone, color, icon,
            budget_period_mode, budget_pay_day,
            sort_order, is_archived, created_at, updated_at
     FROM ledgers
     WHERE deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC;`,
  )
  return rowsOf(result)
}

export async function getLedger(ledgerId) {
  const result = await query(
    `SELECT id, name, currency_code, timezone, color, icon,
            budget_period_mode, budget_pay_day,
            sort_order, is_archived, created_at, updated_at
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
      id, name, currency_code, timezone, color, icon,
      budget_period_mode, budget_pay_day,
      sort_order, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?);`,
    [
      id,
      input.name,
      input.currencyCode ?? 'TWD',
      input.timezone ?? 'Asia/Taipei',
      input.color ?? null,
      input.icon ?? null,
      input.budgetPeriodMode === 'pay_cycle' ? 'pay_cycle' : 'calendar_month',
      Math.min(31, Math.max(1, Math.trunc(Number(input.budgetPayDay ?? 1)) || 1)),
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

export async function updateLedgerBudgetPeriodSettings(ledgerId, input = {}) {
  const mode = String(input.budgetPeriodMode ?? '').trim() === 'pay_cycle' ? 'pay_cycle' : 'calendar_month'
  const payDay = Math.min(31, Math.max(1, Math.trunc(Number(input.budgetPayDay ?? 1)) || 1))
  await run(
    `UPDATE ledgers
     SET budget_period_mode = ?,
         budget_pay_day = ?,
         updated_at = ?
     WHERE id = ? AND deleted_at IS NULL;`,
    [mode, payDay, nowIso(), ledgerId],
  )
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

    // Legacy DB fallback: explicitly clear child rows then delete ledger (FK stays ON).
    await withTransaction(async () => {
      for (const table of LEDGER_CHILD_DELETE_ORDER) {
        await run(`DELETE FROM ${table} WHERE ledger_id = ?;`, [ledgerId])
      }
      await run('DELETE FROM ledgers WHERE id = ?;', [ledgerId])
      await run('DELETE FROM deleted_log WHERE ledger_id = ?;', [ledgerId])
    })
  }
}

export async function purgeLedger(ledgerId) {
  try {
    await run('DELETE FROM ledgers WHERE id = ?;', [ledgerId])
    await run('DELETE FROM deleted_log WHERE ledger_id = ?;', [ledgerId])
  } catch (error) {
    if (!isForeignKeyError(error)) throw error

    await withTransaction(async () => {
      for (const table of LEDGER_CHILD_DELETE_ORDER) {
        await run(`DELETE FROM ${table} WHERE ledger_id = ?;`, [ledgerId])
      }
      await run('DELETE FROM ledgers WHERE id = ?;', [ledgerId])
      await run('DELETE FROM deleted_log WHERE ledger_id = ?;', [ledgerId])
    })
  }
}
