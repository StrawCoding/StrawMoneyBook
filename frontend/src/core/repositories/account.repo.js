import { query, run } from '../db/sqlite.js'
import { createId, nowIso } from '../utils/id.js'
import { isForeignKeyError } from '../utils/sqlite-fk.js'
import { assertLedgerId, rowsOf, firstRow } from './base.repo.js'

function normalizeAccountIcon(icon) {
  const value = String(icon ?? '').trim()
  return value || 'fa-solid fa-wallet'
}

function normalizeCurrencyCode(currencyCode, fallback = 'TWD') {
  const value = String(currencyCode ?? '').trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(value)) return value
  return fallback
}

function normalizeAccountKind(value, fallback = 'cash') {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'credit') return 'credit'
  return fallback === 'credit' ? 'credit' : 'cash'
}

function normalizeMinorAmount(value, fallback = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return Math.max(0, Math.round(Number(fallback) || 0))
  return Math.max(0, Math.round(numeric))
}

function normalizeRepaymentReminderDay(value) {
  if (value === undefined || value === null || value === '') return null
  const numeric = Math.trunc(Number(value))
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 31) return null
  return numeric
}

function normalizeIncludeInAssets(value, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'number') return value === 0 ? 0 : 1
  if (typeof value === 'boolean') return value ? 1 : 0

  const normalized = String(value).trim().toLowerCase()
  if (['0', 'false', 'no', 'off'].includes(normalized)) return 0
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return 1
  return fallback
}

function normalizeIncludeInGroupStatistics(value, fallback = 1) {
  return normalizeIncludeInAssets(value, fallback)
}

function normalizeIsSettlement(value, fallback = 0) {
  return normalizeIncludeInAssets(value, fallback)
}

export async function listAccountGroups(ledgerId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT ledger_id, id, name, type, sort_order, is_archived
     FROM account_groups
     WHERE ledger_id = ? AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC;`,
    [ledgerId],
  )
  return rowsOf(result)
}

export async function listAccounts(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const includeArchived = Boolean(options.includeArchived)

  const result = await query(
    `SELECT a.ledger_id, a.id, a.group_id, a.name, a.account_type, a.account_kind, a.allow_negative, a.opening_balance_minor,
            a.currency_code, a.icon, a.credit_limit_minor, a.repayment_reminder_day,
            a.include_in_assets, a.include_in_group_statistics, a.is_settlement, a.sort_order, a.is_archived,
            sj.goal_type AS savings_jar_goal_type,
            sj.target_amount_minor AS savings_jar_target_amount_minor,
            sj.auto_save_source_account_id AS savings_jar_auto_save_source_account_id,
            sj.auto_save_amount_minor AS savings_jar_auto_save_amount_minor,
            sj.auto_save_interval_value AS savings_jar_auto_save_interval_value,
            sj.auto_save_interval_unit AS savings_jar_auto_save_interval_unit,
            sj.auto_save_start_date AS savings_jar_auto_save_start_date,
            sj.auto_save_charge_day AS savings_jar_auto_save_charge_day,
            sj.auto_save_paused AS savings_jar_auto_save_paused
     FROM accounts a
     LEFT JOIN savings_jars sj
       ON sj.ledger_id = a.ledger_id
      AND sj.account_id = a.id
     WHERE a.ledger_id = ?
       AND a.deleted_at IS NULL
       AND (? = 1 OR a.is_archived = 0)
     ORDER BY a.sort_order ASC, a.created_at ASC;`,
    [ledgerId, includeArchived ? 1 : 0],
  )

  return rowsOf(result)
}

export async function findAccountById(ledgerId, accountId) {
  assertLedgerId(ledgerId)
  if (!accountId) return null

  const result = await query(
    `SELECT a.ledger_id, a.id, a.group_id, a.name, a.account_type, a.account_kind, a.allow_negative, a.opening_balance_minor,
            a.currency_code, a.icon, a.credit_limit_minor, a.repayment_reminder_day,
            a.include_in_assets, a.include_in_group_statistics, a.is_settlement, a.sort_order, a.is_archived,
            sj.goal_type AS savings_jar_goal_type,
            sj.target_amount_minor AS savings_jar_target_amount_minor,
            sj.auto_save_source_account_id AS savings_jar_auto_save_source_account_id,
            sj.auto_save_amount_minor AS savings_jar_auto_save_amount_minor,
            sj.auto_save_interval_value AS savings_jar_auto_save_interval_value,
            sj.auto_save_interval_unit AS savings_jar_auto_save_interval_unit,
            sj.auto_save_start_date AS savings_jar_auto_save_start_date,
            sj.auto_save_charge_day AS savings_jar_auto_save_charge_day,
            sj.auto_save_paused AS savings_jar_auto_save_paused
     FROM accounts a
     LEFT JOIN savings_jars sj
       ON sj.ledger_id = a.ledger_id
      AND sj.account_id = a.id
     WHERE a.ledger_id = ?
       AND a.id = ?
       AND a.deleted_at IS NULL
     LIMIT 1;`,
    [ledgerId, accountId],
  )

  return firstRow(result)
}

export async function createAccountGroup(ledgerId, input) {
  assertLedgerId(ledgerId)
  const id = input.id ?? createId('ag')
  const now = nowIso()

  await run(
    `INSERT INTO account_groups (
      ledger_id, id, name, type, sort_order, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?);`,
    [ledgerId, id, input.name, input.type ?? 'other', input.sortOrder ?? 0, now, now],
  )

  return { ledger_id: ledgerId, id, ...input }
}

export async function createAccount(ledgerId, input) {
  assertLedgerId(ledgerId)
  const id = input.id ?? createId('acc')
  const now = nowIso()
  const icon = normalizeAccountIcon(input.icon)
  const currencyCode = normalizeCurrencyCode(input.currencyCode, 'TWD')
  const accountKind = normalizeAccountKind(input.accountKind, 'cash')
  const creditLimitMinor = normalizeMinorAmount(input.creditLimitMinor, 0)
  const repaymentReminderDay = normalizeRepaymentReminderDay(input.repaymentReminderDay)
  const includeInAssets = normalizeIncludeInAssets(input.includeInAssets, 1)
  const includeInGroupStatistics = normalizeIncludeInGroupStatistics(input.includeInGroupStatistics, 1)
  const isSettlement = normalizeIsSettlement(input.isSettlement ?? input.is_settlement, 0)

  await run(
    `INSERT INTO accounts (
      ledger_id, id, group_id, name, account_type, account_kind, allow_negative, opening_balance_minor,
      currency_code, icon, credit_limit_minor, repayment_reminder_day,
      include_in_assets, include_in_group_statistics, is_settlement, sort_order, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?);`,
    [
      ledgerId,
      id,
      input.groupId,
      input.name,
      input.accountType ?? 'asset',
      accountKind,
      input.allowNegative ? 1 : 0,
      input.openingBalanceMinor ?? 0,
      currencyCode,
      icon,
      creditLimitMinor,
      repaymentReminderDay,
      includeInAssets,
      includeInGroupStatistics,
      isSettlement,
      input.sortOrder ?? 0,
      now,
      now,
    ],
  )

  return { ledger_id: ledgerId, id, ...input }
}

export async function updateAccountIcon(ledgerId, accountId, icon) {
  assertLedgerId(ledgerId)
  if (!accountId) throw new Error('缺少帳戶 ID')
  const normalizedIcon = normalizeAccountIcon(icon)
  await run(
    `UPDATE accounts
     SET icon = ?, updated_at = ?
     WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [normalizedIcon, nowIso(), ledgerId, accountId],
  )
}

export async function updateAccountProfile(ledgerId, accountId, input = {}) {
  assertLedgerId(ledgerId)
  if (!accountId) throw new Error('缺少帳戶 ID')
  const name = String(input.name ?? '').trim()
  const groupId = String(input.groupId ?? '').trim()
  if (!name) throw new Error('帳戶名稱不可為空')
  if (!groupId) throw new Error('缺少帳戶群組')
  const normalizedIcon = normalizeAccountIcon(input.icon)
  const openingBalanceMinorInput = Number(input.openingBalanceMinor)
  const openingBalanceMinor = Number.isFinite(openingBalanceMinorInput) ? Math.round(openingBalanceMinorInput) : null
  const hasCurrencyCode = String(input.currencyCode ?? '').trim() !== ''
  const currencyCode = hasCurrencyCode ? normalizeCurrencyCode(input.currencyCode) : null
  const hasAccountKind = Object.prototype.hasOwnProperty.call(input, 'accountKind')
  const accountKind = hasAccountKind ? normalizeAccountKind(input.accountKind, 'cash') : null
  const hasCreditLimitMinor = Object.prototype.hasOwnProperty.call(input, 'creditLimitMinor')
  const creditLimitMinor = hasCreditLimitMinor ? normalizeMinorAmount(input.creditLimitMinor, 0) : null
  const hasRepaymentReminderDay = Object.prototype.hasOwnProperty.call(input, 'repaymentReminderDay')
  const repaymentReminderDay = hasRepaymentReminderDay ? normalizeRepaymentReminderDay(input.repaymentReminderDay) : undefined
  const hasIncludeInAssets = Object.prototype.hasOwnProperty.call(input, 'includeInAssets')
  const includeInAssets = hasIncludeInAssets ? normalizeIncludeInAssets(input.includeInAssets, 1) : null
  const hasIncludeInGroupStatistics = Object.prototype.hasOwnProperty.call(input, 'includeInGroupStatistics')
  const includeInGroupStatistics = hasIncludeInGroupStatistics ? normalizeIncludeInGroupStatistics(input.includeInGroupStatistics, 1) : null
  const hasIsSettlement = Object.prototype.hasOwnProperty.call(input, 'isSettlement')
    || Object.prototype.hasOwnProperty.call(input, 'is_settlement')
  const isSettlement = hasIsSettlement
    ? normalizeIsSettlement(input.isSettlement ?? input.is_settlement, 0)
    : null

  await run(
    `UPDATE accounts
     SET name = ?,
         group_id = ?,
         icon = ?,
         account_kind = COALESCE(?, account_kind),
         currency_code = COALESCE(?, currency_code),
         opening_balance_minor = COALESCE(?, opening_balance_minor),
         credit_limit_minor = COALESCE(?, credit_limit_minor),
         repayment_reminder_day = CASE
           WHEN ? = 1 THEN ?
           ELSE repayment_reminder_day
         END,
         include_in_assets = COALESCE(?, include_in_assets),
         include_in_group_statistics = COALESCE(?, include_in_group_statistics),
         is_settlement = COALESCE(?, is_settlement),
         updated_at = ?
     WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [
      name,
      groupId,
      normalizedIcon,
      accountKind,
      currencyCode,
      openingBalanceMinor,
      creditLimitMinor,
      hasRepaymentReminderDay ? 1 : 0,
      hasRepaymentReminderDay ? repaymentReminderDay : null,
      includeInAssets,
      includeInGroupStatistics,
      isSettlement,
      nowIso(),
      ledgerId,
      accountId,
    ],
  )
}

export async function updateAccountGroupProfile(ledgerId, groupId, input = {}) {
  assertLedgerId(ledgerId)
  if (!groupId) throw new Error('缺少帳戶群組 ID')
  const name = String(input.name ?? '').trim()
  if (!name) throw new Error('帳戶群組名稱不可為空')

  await run(
    `UPDATE account_groups
     SET name = ?,
         updated_at = ?
     WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [name, nowIso(), ledgerId, groupId],
  )
}

export async function countAccountsByGroup(ledgerId, groupId) {
  assertLedgerId(ledgerId)
  if (!groupId) return 0

  const result = await query(
    `SELECT COUNT(*) AS count
     FROM accounts
     WHERE ledger_id = ? AND group_id = ? AND deleted_at IS NULL;`,
    [ledgerId, groupId],
  )
  return Number(firstRow(result)?.count ?? 0)
}

export async function deleteAccountGroupIfEmpty(ledgerId, groupId) {
  assertLedgerId(ledgerId)
  if (!groupId) return

  const accountCount = await countAccountsByGroup(ledgerId, groupId)
  if (accountCount > 0) {
    throw new Error('群組內尚有帳戶，請先移除帳戶')
  }

  await run('DELETE FROM account_groups WHERE ledger_id = ? AND id = ?;', [ledgerId, groupId])
}

export async function updateAccountGroupSortOrders(ledgerId, groupIds = []) {
  assertLedgerId(ledgerId)
  if (!Array.isArray(groupIds) || groupIds.length === 0) return

  const now = nowIso()
  for (let index = 0; index < groupIds.length; index += 1) {
    const groupId = groupIds[index]
    if (!groupId) continue

    await run(
      `UPDATE account_groups
       SET sort_order = ?, updated_at = ?
       WHERE ledger_id = ? AND id = ?;`,
      [index, now, ledgerId, groupId],
    )
  }
}

export async function updateAccountSortOrdersByGroup(ledgerId, groupId, accountIds = []) {
  assertLedgerId(ledgerId)
  if (!groupId || !Array.isArray(accountIds) || accountIds.length === 0) return

  const now = nowIso()
  for (let index = 0; index < accountIds.length; index += 1) {
    const accountId = accountIds[index]
    if (!accountId) continue

    await run(
      `UPDATE accounts
       SET sort_order = ?, updated_at = ?
       WHERE ledger_id = ? AND id = ? AND group_id = ?;`,
      [index, now, ledgerId, accountId, groupId],
    )
  }
}

export async function countAccountTransactions(ledgerId, accountId) {
  const result = await query(
    `SELECT COUNT(*) AS count
     FROM transactions
     WHERE ledger_id = ?
       AND (account_id = ? OR peer_account_id = ?)
       AND deleted_at IS NULL;`,
    [ledgerId, accountId, accountId],
  )
  return Number(firstRow(result)?.count ?? 0)
}

/**
 * Count every row that would block DELETE FROM accounts under PRAGMA foreign_keys.
 * Includes soft-deleted transactions — RESTRICT still applies to those rows.
 */
export async function countAccountForeignKeyRefs(ledgerId, accountId) {
  const counts = await Promise.all([
    query(
      `SELECT COUNT(*) AS count
       FROM transactions
       WHERE ledger_id = ?
         AND (account_id = ? OR peer_account_id = ?);`,
      [ledgerId, accountId, accountId],
    ),
    query(
      `SELECT COUNT(*) AS count
       FROM loan_payments
       WHERE ledger_id = ? AND account_id = ?;`,
      [ledgerId, accountId],
    ),
    query(
      `SELECT COUNT(*) AS count
       FROM reimbursement_advances
       WHERE ledger_id = ? AND account_id = ?;`,
      [ledgerId, accountId],
    ),
    query(
      `SELECT COUNT(*) AS count
       FROM reimbursement_items
       WHERE ledger_id = ? AND account_id = ?;`,
      [ledgerId, accountId],
    ),
    query(
      `SELECT COUNT(*) AS count
       FROM bank_accounts
       WHERE ledger_id = ? AND mapped_account_id = ?;`,
      [ledgerId, accountId],
    ),
    query(
      `SELECT COUNT(*) AS count
       FROM savings_jars
       WHERE ledger_id = ? AND account_id = ?;`,
      [ledgerId, accountId],
    ),
  ])

  return counts.reduce((total, result) => total + Number(firstRow(result)?.count ?? 0), 0)
}

export async function archiveAccount(ledgerId, accountId) {
  assertLedgerId(ledgerId)
  await run('UPDATE accounts SET is_archived = 1, updated_at = ? WHERE ledger_id = ? AND id = ?;', [
    nowIso(),
    ledgerId,
    accountId,
  ])
}

export async function softDeleteAccount(ledgerId, accountId) {
  assertLedgerId(ledgerId)
  const now = nowIso()
  await run(
    `UPDATE accounts
     SET is_archived = 1,
         deleted_at = ?,
         updated_at = ?
     WHERE ledger_id = ? AND id = ?;`,
    [now, now, ledgerId, accountId],
  )
}

export async function restoreAccount(ledgerId, accountId) {
  assertLedgerId(ledgerId)
  if (!accountId) throw new Error('缺少帳戶 ID')
  await run(
    `UPDATE accounts
     SET is_archived = 0,
         deleted_at = NULL,
         updated_at = ?
     WHERE ledger_id = ? AND id = ?;`,
    [nowIso(), ledgerId, accountId],
  )
}

export async function deleteAccountIfUnused(ledgerId, accountId) {
  const activeCount = await countAccountTransactions(ledgerId, accountId)
  if (activeCount > 0) {
    await archiveAccount(ledgerId, accountId)
    return { archived: true, deleted: false }
  }

  const blockingRefs = await countAccountForeignKeyRefs(ledgerId, accountId)
  if (blockingRefs > 0) {
    // Soft-deleted txs / loans / bank maps still RESTRICT hard delete — archive+soft-delete instead of 1811.
    await softDeleteAccount(ledgerId, accountId)
    return { archived: true, deleted: false, blockedByForeignKeys: blockingRefs }
  }

  try {
    await run('DELETE FROM accounts WHERE ledger_id = ? AND id = ?;', [ledgerId, accountId])
    return { archived: false, deleted: true }
  } catch (error) {
    if (!isForeignKeyError(error)) throw error
    await softDeleteAccount(ledgerId, accountId)
    return { archived: true, deleted: false, blockedByForeignKeys: true }
  }
}

export async function getAccountBalances(ledgerId, options = {}) {
  const includeArchived = Boolean(options.includeArchived)

  const result = await query(
    `SELECT
       a.ledger_id,
       a.id,
       a.group_id,
       a.name,
       a.account_type,
       a.allow_negative,
       a.currency_code,
       a.icon,
       a.include_in_assets,
       a.include_in_group_statistics,
       a.opening_balance_minor,
       a.is_archived,
       COALESCE((
         SELECT SUM(
           CASE
             WHEN ra.amount_minor > ra.used_minor + COALESCE(ra.return_amount_minor, 0)
             THEN ra.amount_minor - ra.used_minor - COALESCE(ra.return_amount_minor, 0)
             ELSE 0
           END
         )
         FROM reimbursement_advances ra
         WHERE ra.ledger_id = a.ledger_id
           AND ra.account_id = a.id
           AND ra.deleted_at IS NULL
       ), 0) AS reimbursement_advance_minor,
       a.opening_balance_minor + COALESCE(SUM(t.amount_minor), 0) AS balance_minor
     FROM accounts a
     LEFT JOIN transactions t
       ON t.ledger_id = a.ledger_id
      AND t.account_id = a.id
      AND t.deleted_at IS NULL
     WHERE a.ledger_id = ?
       AND a.deleted_at IS NULL
       AND (? = 1 OR a.is_archived = 0)
     GROUP BY a.ledger_id, a.id
     ORDER BY a.sort_order ASC, a.created_at ASC;`,
    [ledgerId, includeArchived ? 1 : 0],
  )

  return rowsOf(result)
}
