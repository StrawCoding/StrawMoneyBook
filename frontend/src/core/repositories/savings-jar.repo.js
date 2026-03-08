import { query, run } from '@/core/db/sqlite'
import { nowIso } from '@/core/utils/id'
import { assertLedgerId, firstRow } from '@/core/repositories/base.repo'

function normalizeGoalType(value) {
  return String(value ?? '').trim() === 'target' ? 'target' : 'open'
}

function normalizeTargetAmountMinor(goalType, value) {
  if (goalType !== 'target') return null
  const amount = Number(value)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('目標金額需大於 0')
  }
  return amount
}

export async function countSavingsJars(ledgerId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT COUNT(*) AS count
     FROM savings_jars sj
     INNER JOIN accounts a
       ON a.ledger_id = sj.ledger_id
      AND a.id = sj.account_id
     WHERE sj.ledger_id = ?
       AND a.deleted_at IS NULL
       AND a.is_archived = 0;`,
    [ledgerId],
  )
  return Number(firstRow(result)?.count ?? 0)
}

export async function isSavingsJarAccount(ledgerId, accountId) {
  assertLedgerId(ledgerId)
  if (!accountId) return false
  const result = await query(
    `SELECT 1 AS ok
     FROM savings_jars
     WHERE ledger_id = ?
       AND account_id = ?
     LIMIT 1;`,
    [ledgerId, accountId],
  )
  return Boolean(firstRow(result)?.ok)
}

export async function createSavingsJarMeta(ledgerId, input = {}) {
  assertLedgerId(ledgerId)
  const accountId = String(input.accountId ?? '').trim()
  if (!accountId) throw new Error('缺少存錢罐帳戶 ID')
  const goalType = normalizeGoalType(input.goalType)
  const targetAmountMinor = normalizeTargetAmountMinor(goalType, input.targetAmountMinor)
  const now = nowIso()

  await run(
    `INSERT INTO savings_jars (
      ledger_id, account_id, goal_type, target_amount_minor, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?);`,
    [ledgerId, accountId, goalType, targetAmountMinor, now, now],
  )
}

export async function updateSavingsJarMeta(ledgerId, accountId, input = {}) {
  assertLedgerId(ledgerId)
  const normalizedAccountId = String(accountId ?? '').trim()
  if (!normalizedAccountId) throw new Error('缺少存錢罐帳戶 ID')
  const goalType = normalizeGoalType(input.goalType)
  const targetAmountMinor = normalizeTargetAmountMinor(goalType, input.targetAmountMinor)

  await run(
    `UPDATE savings_jars
     SET goal_type = ?,
         target_amount_minor = ?,
         updated_at = ?
     WHERE ledger_id = ? AND account_id = ?;`,
    [goalType, targetAmountMinor, nowIso(), ledgerId, normalizedAccountId],
  )
}
