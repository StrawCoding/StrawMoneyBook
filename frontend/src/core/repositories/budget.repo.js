import { query, run } from '../db/sqlite.js'
import { createId, nowIso } from '../utils/id.js'
import { refundDeductedMinorSql } from '../domain/refund-match-sql.js'
import { assertLedgerId, firstRow, rowsOf } from './base.repo.js'

function normalizePeriodMode(value) {
  return String(value ?? '').trim() === 'daily' ? 'daily' : 'monthly'
}

function normalizeSurplusMode(value, budgetSaveEnabled = false) {
  const mode = String(value ?? '').trim()
  if (mode === 'save') return 'save'
  if (mode === 'roll') return 'roll'
  return budgetSaveEnabled ? 'save' : 'roll'
}

function normalizeBudgetSaveAccountId(value) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeBudgetSaveEnabled(value) {
  return value === true || value === 1 || value === '1'
}

function buildBudgetSaveSettlementId(scopeType, scopeRefId, periodKey) {
  return `${String(scopeType ?? '').trim()}:${String(scopeRefId ?? '').trim()}:${String(periodKey ?? '').trim()}`
}

function normalizeBudgetPeriodMode(value) {
  return String(value ?? '').trim() === 'pay_cycle' ? 'pay_cycle' : 'calendar_month'
}

function normalizePeriodKey(value, fallback) {
  const normalized = String(value ?? '').trim()
  return normalized || String(fallback ?? '').trim()
}

function budgetSpentMinorSql(sourceAlias = 'transactions') {
  const deductedSql = refundDeductedMinorSql(sourceAlias)
  return `(CASE
    WHEN ABS(${sourceAlias}.amount_minor) - ${deductedSql} > 0
    THEN ABS(${sourceAlias}.amount_minor) - ${deductedSql}
    ELSE 0
  END)`
}

export async function getBudgetByMonth(ledgerId, monthKey) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT ledger_id, id, month_key,
            COALESCE(period_key, month_key) AS period_key,
            COALESCE(period_start_date, month_key || '-01') AS period_start_date,
            COALESCE(period_end_date, date(month_key || '-01', '+1 month', '-1 day')) AS period_end_date,
            COALESCE(period_mode, 'calendar_month') AS period_mode,
            name,
            include_transfers, include_loan_repayments, include_reimbursed_expenses,
            budget_save_total_enabled, budget_save_total_target_account_id, budget_save_total_source_account_id,
            created_at, updated_at
     FROM budgets
     WHERE ledger_id = ? AND month_key = ? AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, monthKey],
  )
  return firstRow(result)
}

export async function getBudgetByPeriod(ledgerId, periodKey) {
  assertLedgerId(ledgerId)
  const key = String(periodKey ?? '').trim()
  if (!key) return null
  const result = await query(
    `SELECT ledger_id, id, month_key,
            COALESCE(period_key, month_key) AS period_key,
            COALESCE(period_start_date, month_key || '-01') AS period_start_date,
            COALESCE(period_end_date, date(month_key || '-01', '+1 month', '-1 day')) AS period_end_date,
            COALESCE(period_mode, 'calendar_month') AS period_mode,
            name,
            include_transfers, include_loan_repayments, include_reimbursed_expenses,
            budget_save_total_enabled, budget_save_total_target_account_id, budget_save_total_source_account_id,
            created_at, updated_at
     FROM budgets
     WHERE ledger_id = ?
       AND COALESCE(period_key, month_key) = ?
       AND deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, key],
  )
  return firstRow(result)
}

export async function createBudget(ledgerId, input) {
  assertLedgerId(ledgerId)
  const id = input.id ?? createId('budget')
  const now = nowIso()

  await run(
    `INSERT INTO budgets (
      ledger_id, id, month_key,
      period_key, period_start_date, period_end_date, period_mode,
      name,
      include_transfers, include_loan_repayments, include_reimbursed_expenses,
      budget_save_total_enabled, budget_save_total_target_account_id, budget_save_total_source_account_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      ledgerId,
      id,
      input.monthKey,
      normalizePeriodKey(input.periodKey, input.monthKey),
      input.periodStartDate ?? null,
      input.periodEndDate ?? null,
      normalizeBudgetPeriodMode(input.periodMode),
      input.name ?? null,
      input.includeTransfers ? 1 : 0,
      input.includeLoanRepayments ? 1 : 0,
      input.includeReimbursedExpenses ? 1 : 0,
      normalizeBudgetSaveEnabled(input.budgetSaveTotalEnabled),
      normalizeBudgetSaveAccountId(input.budgetSaveTotalTargetAccountId),
      normalizeBudgetSaveAccountId(input.budgetSaveTotalSourceAccountId),
      now,
      now,
    ],
  )

  return getBudgetByPeriod(ledgerId, normalizePeriodKey(input.periodKey, input.monthKey))
}

export async function listBudgetsWithSaveRules(ledgerId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT b.ledger_id, b.id, b.month_key,
            COALESCE(b.period_key, b.month_key) AS period_key,
            COALESCE(b.period_start_date, b.month_key || '-01') AS period_start_date,
            COALESCE(b.period_end_date, date(b.month_key || '-01', '+1 month', '-1 day')) AS period_end_date,
            COALESCE(b.period_mode, 'calendar_month') AS period_mode,
            b.name,
            b.include_transfers, b.include_loan_repayments, b.include_reimbursed_expenses,
            b.budget_save_total_enabled, b.budget_save_total_target_account_id, b.budget_save_total_source_account_id,
            b.created_at, b.updated_at
     FROM budgets b
     WHERE b.ledger_id = ?
       AND b.deleted_at IS NULL
       AND (
         b.budget_save_total_enabled = 1
         OR EXISTS (
           SELECT 1
           FROM budget_items bi
           WHERE bi.ledger_id = b.ledger_id
             AND bi.budget_id = b.id
             AND bi.budget_save_enabled = 1
         )
         OR EXISTS (
           SELECT 1
           FROM budget_containers bc
           WHERE bc.ledger_id = b.ledger_id
             AND bc.budget_id = b.id
             AND bc.budget_save_enabled = 1
         )
       )
     ORDER BY COALESCE(b.period_start_date, b.month_key || '-01') ASC, b.created_at ASC;`,
    [ledgerId],
  )
  return rowsOf(result)
}

export async function listBudgetContainers(ledgerId, budgetId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT ledger_id, id, budget_id, name, amount_minor,
            budget_save_enabled, budget_save_target_account_id, budget_save_source_account_id,
            period_mode, surplus_mode, sort_order, created_at, updated_at
     FROM budget_containers
     WHERE ledger_id = ? AND budget_id = ?
     ORDER BY sort_order ASC, created_at ASC;`,
    [ledgerId, budgetId],
  )
  return rowsOf(result).map((row) => ({
    ...row,
    surplus_mode: normalizeSurplusMode(row?.surplus_mode, Number(row?.budget_save_enabled ?? 0) === 1),
  }))
}

export async function upsertBudgetContainer(ledgerId, input) {
  assertLedgerId(ledgerId)
  const now = nowIso()
  const id = input.id ?? createId('bc')

  const budgetSaveEnabled = normalizeBudgetSaveEnabled(input.budgetSaveEnabled)
  const surplusMode = normalizeSurplusMode(input.surplusMode, budgetSaveEnabled)

  await run(
    `INSERT INTO budget_containers (
      ledger_id, id, budget_id, name, amount_minor,
      budget_save_enabled, budget_save_target_account_id, budget_save_source_account_id,
      period_mode, surplus_mode, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ledger_id, id) DO UPDATE SET
      name = excluded.name,
      amount_minor = excluded.amount_minor,
      budget_save_enabled = excluded.budget_save_enabled,
      budget_save_target_account_id = excluded.budget_save_target_account_id,
      budget_save_source_account_id = excluded.budget_save_source_account_id,
      period_mode = excluded.period_mode,
      surplus_mode = excluded.surplus_mode,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at;`,
    [
      ledgerId,
      id,
      input.budgetId,
      input.name,
      Math.max(0, Math.round(Number(input.amountMinor ?? 0))),
      budgetSaveEnabled,
      normalizeBudgetSaveAccountId(input.budgetSaveTargetAccountId),
      normalizeBudgetSaveAccountId(input.budgetSaveSourceAccountId),
      normalizePeriodMode(input.periodMode),
      surplusMode,
      input.sortOrder ?? 0,
      now,
      now,
    ],
  )

  return id
}

export async function deleteBudgetContainer(ledgerId, containerId) {
  assertLedgerId(ledgerId)
  if (!containerId) return
  const now = nowIso()
  await run(
    `UPDATE budget_items
     SET budget_container_id = NULL, updated_at = ?
     WHERE ledger_id = ? AND budget_container_id = ?;`,
    [now, ledgerId, containerId],
  )
  await run('DELETE FROM budget_containers WHERE ledger_id = ? AND id = ?;', [ledgerId, containerId])
}

export async function deleteBudgetContainersByBudget(ledgerId, budgetId) {
  assertLedgerId(ledgerId)
  await run('DELETE FROM budget_containers WHERE ledger_id = ? AND budget_id = ?;', [ledgerId, budgetId])
}

export async function listBudgetItems(ledgerId, budgetId) {
  const result = await query(
    `SELECT bi.ledger_id, bi.id, bi.budget_id, bi.scope_type, bi.category_id, bi.category_group_id,
            bi.budget_container_id,
            bi.amount_minor, bi.amount_mode, bi.day_rule_unit, bi.day_rule_values_json,
            bi.budget_save_enabled, bi.budget_save_target_account_id, bi.budget_save_source_account_id,
            bi.sort_order AS sort_order, c.name AS category_name
     FROM budget_items bi
     LEFT JOIN categories c
       ON c.ledger_id = bi.ledger_id
      AND c.id = bi.category_id
     WHERE bi.ledger_id = ? AND bi.budget_id = ?
     ORDER BY bi.sort_order ASC, bi.created_at ASC;`,
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
      budget_container_id,
      amount_minor, amount_mode, day_rule_unit, day_rule_values_json,
      budget_save_enabled, budget_save_target_account_id, budget_save_source_account_id,
      sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ledger_id, id) DO UPDATE SET
      scope_type = excluded.scope_type,
      category_id = excluded.category_id,
      category_group_id = excluded.category_group_id,
      budget_container_id = excluded.budget_container_id,
      amount_minor = excluded.amount_minor,
      amount_mode = excluded.amount_mode,
      day_rule_unit = excluded.day_rule_unit,
      day_rule_values_json = excluded.day_rule_values_json,
      budget_save_enabled = excluded.budget_save_enabled,
      budget_save_target_account_id = excluded.budget_save_target_account_id,
      budget_save_source_account_id = excluded.budget_save_source_account_id,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at;`,
    [
      ledgerId,
      id,
      input.budgetId,
      input.scopeType,
      input.categoryId ?? null,
      input.categoryGroupId ?? null,
      input.budgetContainerId ?? null,
      input.amountMinor,
      input.amountMode ?? 'fixed',
      input.dayRuleUnit ?? 'none',
      input.dayRuleValuesJson ?? '[]',
      normalizeBudgetSaveEnabled(input.budgetSaveEnabled),
      normalizeBudgetSaveAccountId(input.budgetSaveTargetAccountId),
      normalizeBudgetSaveAccountId(input.budgetSaveSourceAccountId),
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

export async function updateBudgetSaveTotalConfig(ledgerId, budgetId, input = {}) {
  assertLedgerId(ledgerId)
  if (!budgetId) throw new Error('缺少預算 ID')
  await run(
    `UPDATE budgets
     SET budget_save_total_enabled = ?,
         budget_save_total_target_account_id = ?,
         budget_save_total_source_account_id = ?,
         updated_at = ?
     WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [
      normalizeBudgetSaveEnabled(input.enabled),
      normalizeBudgetSaveAccountId(input.targetAccountId),
      normalizeBudgetSaveAccountId(input.sourceAccountId),
      nowIso(),
      ledgerId,
      budgetId,
    ],
  )
}

export async function computeBudgetSpentByCategory(ledgerId, monthStartUtc, monthEndUtc) {
  const result = await query(
    `SELECT category_id, SUM(${budgetSpentMinorSql('transactions')}) AS spent_minor
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

export async function listBudgetUsageDaysByCategory(ledgerId, monthStartUtc, monthEndUtc) {
  const result = await query(
    `SELECT category_id, substr(occurred_at, 1, 10) AS occurred_day
     FROM transactions
     WHERE ledger_id = ?
       AND deleted_at IS NULL
       AND type = 'expense'
       AND include_in_budget = 1
       AND ${budgetSpentMinorSql('transactions')} > 0
       AND occurred_at >= ?
       AND occurred_at < ?
       AND category_id IS NOT NULL
     GROUP BY category_id, substr(occurred_at, 1, 10);`,
    [ledgerId, monthStartUtc, monthEndUtc],
  )

  return rowsOf(result)
}

export async function listBudgetSpentByCategoryAndDay(ledgerId, monthStartUtc, monthEndUtc) {
  const result = await query(
    `SELECT category_id,
            substr(occurred_at, 1, 10) AS occurred_day,
            SUM(${budgetSpentMinorSql('transactions')}) AS spent_minor
     FROM transactions
     WHERE ledger_id = ?
       AND deleted_at IS NULL
       AND type = 'expense'
       AND include_in_budget = 1
       AND occurred_at >= ?
       AND occurred_at < ?
       AND category_id IS NOT NULL
     GROUP BY category_id, substr(occurred_at, 1, 10);`,
    [ledgerId, monthStartUtc, monthEndUtc],
  )

  return rowsOf(result)
}

export async function getBudgetSaveSettlement(ledgerId, scopeType, scopeRefId, periodKey) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT ledger_id, id, scope_type, scope_ref_id, period_key,
            source_account_id, target_account_id, settled_amount_minor, status,
            transfer_group_id, last_error, created_at, updated_at
     FROM budget_save_settlements
     WHERE ledger_id = ?
       AND scope_type = ?
       AND scope_ref_id = ?
       AND period_key = ?
     LIMIT 1;`,
    [ledgerId, scopeType, scopeRefId, periodKey],
  )
  return firstRow(result)
}

export async function upsertBudgetSaveSettlement(ledgerId, input = {}) {
  assertLedgerId(ledgerId)
  const scopeType = String(input.scopeType ?? '').trim()
  const scopeRefId = String(input.scopeRefId ?? '').trim()
  const periodKey = String(input.periodKey ?? '').trim()
  if (!scopeType || !scopeRefId || !periodKey) {
    throw new Error('預算存款結算資料不完整')
  }
  const now = nowIso()
  const id = String(input.id ?? '').trim() || buildBudgetSaveSettlementId(scopeType, scopeRefId, periodKey)
  await run(
    `INSERT INTO budget_save_settlements (
      ledger_id, id, scope_type, scope_ref_id, period_key,
      source_account_id, target_account_id, settled_amount_minor, status,
      transfer_group_id, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ledger_id, id) DO UPDATE SET
      source_account_id = excluded.source_account_id,
      target_account_id = excluded.target_account_id,
      settled_amount_minor = excluded.settled_amount_minor,
      status = excluded.status,
      transfer_group_id = excluded.transfer_group_id,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at;`,
    [
      ledgerId,
      id,
      scopeType,
      scopeRefId,
      periodKey,
      normalizeBudgetSaveAccountId(input.sourceAccountId),
      normalizeBudgetSaveAccountId(input.targetAccountId),
      Math.max(0, Math.round(Number(input.settledAmountMinor ?? 0) || 0)),
      String(input.status ?? 'failed').trim() || 'failed',
      normalizeBudgetSaveAccountId(input.transferGroupId),
      String(input.lastError ?? '').trim() || null,
      now,
      now,
    ],
  )
  return getBudgetSaveSettlement(ledgerId, scopeType, scopeRefId, periodKey)
}

export async function deleteBudgetSaveSettlement(ledgerId, scopeType, scopeRefId, periodKey) {
  assertLedgerId(ledgerId)
  await run(
    `DELETE FROM budget_save_settlements
     WHERE ledger_id = ?
       AND scope_type = ?
       AND scope_ref_id = ?
       AND period_key = ?;`,
    [ledgerId, scopeType, scopeRefId, periodKey],
  )
}
