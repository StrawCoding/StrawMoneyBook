import { query, run } from '@/core/db/sqlite'
import { createId, nowIso } from '@/core/utils/id'
import { assertLedgerId, rowsOf, firstRow } from '@/core/repositories/base.repo'

function normalizeAccountIcon(icon) {
  const value = String(icon ?? '').trim()
  return value || 'fa-solid fa-wallet'
}

function normalizeCurrencyCode(currencyCode, fallback = 'TWD') {
  const value = String(currencyCode ?? '').trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(value)) return value
  return fallback
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
    `SELECT a.ledger_id, a.id, a.group_id, a.name, a.account_type, a.allow_negative, a.opening_balance_minor,
            a.currency_code, a.icon, a.include_in_assets, a.sort_order, a.is_archived,
            sj.goal_type AS savings_jar_goal_type,
            sj.target_amount_minor AS savings_jar_target_amount_minor
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
    `SELECT a.ledger_id, a.id, a.group_id, a.name, a.account_type, a.allow_negative, a.opening_balance_minor,
            a.currency_code, a.icon, a.include_in_assets, a.sort_order, a.is_archived,
            sj.goal_type AS savings_jar_goal_type,
            sj.target_amount_minor AS savings_jar_target_amount_minor
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
  const includeInAssets = normalizeIncludeInAssets(input.includeInAssets, 1)

  await run(
    `INSERT INTO accounts (
      ledger_id, id, group_id, name, account_type, allow_negative, opening_balance_minor,
      currency_code, icon, include_in_assets, sort_order, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?);`,
    [
      ledgerId,
      id,
      input.groupId,
      input.name,
      input.accountType ?? 'asset',
      input.allowNegative ? 1 : 0,
      input.openingBalanceMinor ?? 0,
      currencyCode,
      icon,
      includeInAssets,
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
  const hasIncludeInAssets = Object.prototype.hasOwnProperty.call(input, 'includeInAssets')
  const includeInAssets = hasIncludeInAssets ? normalizeIncludeInAssets(input.includeInAssets, 1) : null

  await run(
    `UPDATE accounts
     SET name = ?,
         group_id = ?,
         icon = ?,
         currency_code = COALESCE(?, currency_code),
         opening_balance_minor = COALESCE(?, opening_balance_minor),
         include_in_assets = COALESCE(?, include_in_assets),
         updated_at = ?
     WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [name, groupId, normalizedIcon, currencyCode, openingBalanceMinor, includeInAssets, nowIso(), ledgerId, accountId],
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
     WHERE ledger_id = ? AND account_id = ? AND deleted_at IS NULL;`,
    [ledgerId, accountId],
  )
  return Number(firstRow(result)?.count ?? 0)
}

export async function archiveAccount(ledgerId, accountId) {
  assertLedgerId(ledgerId)
  await run('UPDATE accounts SET is_archived = 1, updated_at = ? WHERE ledger_id = ? AND id = ?;', [
    nowIso(),
    ledgerId,
    accountId,
  ])
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
  const count = await countAccountTransactions(ledgerId, accountId)
  if (count > 0) {
    await archiveAccount(ledgerId, accountId)
    return { archived: true, deleted: false }
  }

  await run('DELETE FROM accounts WHERE ledger_id = ? AND id = ?;', [ledgerId, accountId])
  return { archived: false, deleted: true }
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
       a.opening_balance_minor,
       a.is_archived,
       COALESCE((
         SELECT SUM(
           CASE
             WHEN ra.amount_minor > ra.used_minor THEN ra.amount_minor - ra.used_minor
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
