import { query, run } from '@/core/db/sqlite'
import { createId, nowIso } from '@/core/utils/id'
import { assertLedgerId, firstRow, rowsOf } from '@/core/repositories/base.repo'

export async function getBudgetByMonth(ledgerId, monthKey) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT ledger_id, id, month_key, name,
            include_transfers, include_loan_repayments, include_reimbursed_expenses,
            created_at, updated_at
     FROM budgets
     WHERE ledger_id = ? AND month_key = ? AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, monthKey],
  )
  return firstRow(result)
}

export async function createBudget(ledgerId, input) {
  assertLedgerId(ledgerId)
  const id = input.id ?? createId('budget')
  const now = nowIso()

  await run(
    `INSERT INTO budgets (
      ledger_id, id, month_key, name,
      include_transfers, include_loan_repayments, include_reimbursed_expenses,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      ledgerId,
      id,
      input.monthKey,
      input.name ?? null,
      input.includeTransfers ? 1 : 0,
      input.includeLoanRepayments ? 1 : 0,
      input.includeReimbursedExpenses ? 1 : 0,
      now,
      now,
    ],
  )

  return getBudgetByMonth(ledgerId, input.monthKey)
}

export async function listBudgetItems(ledgerId, budgetId) {
  const result = await query(
    `SELECT ledger_id, id, budget_id, scope_type, category_id, category_group_id,
            amount_minor, sort_order
     FROM budget_items
     WHERE ledger_id = ? AND budget_id = ?
     ORDER BY sort_order ASC, created_at ASC;`,
    [ledgerId, budgetId],
  )

  return rowsOf(result)
}

export async function upsertBudgetItem(ledgerId, input) {
  const now = nowIso()
  const id = input.id ?? createId('bi')

  await run(
    `INSERT INTO budget_items (
      ledger_id, id, budget_id, scope_type, category_id, category_group_id,
      amount_minor, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ledger_id, id) DO UPDATE SET
      scope_type = excluded.scope_type,
      category_id = excluded.category_id,
      category_group_id = excluded.category_group_id,
      amount_minor = excluded.amount_minor,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at;`,
    [
      ledgerId,
      id,
      input.budgetId,
      input.scopeType,
      input.categoryId ?? null,
      input.categoryGroupId ?? null,
      input.amountMinor,
      input.sortOrder ?? 0,
      now,
      now,
    ],
  )

  return id
}

export async function deleteBudgetItem(ledgerId, budgetItemId) {
  await run('DELETE FROM budget_items WHERE ledger_id = ? AND id = ?;', [ledgerId, budgetItemId])
}

export async function deleteBudgetItemsByBudget(ledgerId, budgetId) {
  await run('DELETE FROM budget_items WHERE ledger_id = ? AND budget_id = ?;', [ledgerId, budgetId])
}

export async function computeBudgetSpentByCategory(ledgerId, monthStartUtc, monthEndUtc) {
  const result = await query(
    `SELECT category_id, ABS(SUM(amount_minor)) AS spent_minor
     FROM transactions
     WHERE ledger_id = ?
       AND deleted_at IS NULL
       AND type = 'expense'
       AND include_in_budget = 1
       AND occurred_at >= ?
       AND occurred_at < ?
       AND category_id IS NOT NULL
     GROUP BY category_id;`,
    [ledgerId, monthStartUtc, monthEndUtc],
  )

  return rowsOf(result)
}
