import { query, run } from '@/core/db/sqlite'
import { nowIso } from '@/core/utils/id'
import { assertLedgerId, firstRow } from '@/core/repositories/base.repo'
import { normalizeSubscriptionChargeDay, normalizeSubscriptionDateInput } from '@/core/utils/subscription-schedule'

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

function normalizeIntervalUnit(value) {
  const unit = String(value ?? '').trim().toLowerCase()
  if (unit === 'year') return 'year'
  if (unit === 'day') return 'day'
  return 'month'
}

function normalizeAutoSaveConfig(input = {}) {
  if (input === null) {
    return {
      sourceAccountId: null,
      amountMinor: null,
      intervalValue: null,
      intervalUnit: null,
      startDate: null,
      chargeDay: null,
      paused: 0,
    }
  }

  const sourceAccountId = String(input.autoSaveSourceAccountId ?? input.sourceAccountId ?? '').trim()
  const startDate = normalizeSubscriptionDateInput(input.autoSaveStartDate ?? input.startDate)
  const rawAmountMinor = input.autoSaveAmountMinor ?? input.amountMinor
  const rawIntervalValue = input.autoSaveIntervalValue ?? input.intervalValue
  const rawIntervalUnit = input.autoSaveIntervalUnit ?? input.intervalUnit
  const rawChargeDay = input.autoSaveChargeDay ?? input.chargeDay
  const paused = Number(input.autoSavePaused ?? input.paused) ? 1 : 0
  const isUnset = !sourceAccountId && (rawAmountMinor === null || rawAmountMinor === undefined || rawAmountMinor === '') && !startDate

  if (isUnset) {
    return {
      sourceAccountId: null,
      amountMinor: null,
      intervalValue: null,
      intervalUnit: null,
      startDate: null,
      chargeDay: null,
      paused,
    }
  }

  if (!sourceAccountId || !startDate) {
    throw new Error('自動存錢設定不完整')
  }

  const amountMinor = Math.round(Number(rawAmountMinor) || 0)
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('自動存錢金額需大於 0')
  }

  const intervalValue = Math.max(1, Math.trunc(Number(rawIntervalValue) || 1))
  const intervalUnit = normalizeIntervalUnit(rawIntervalUnit)
  const chargeDay = intervalUnit === 'month'
    ? normalizeSubscriptionChargeDay(rawChargeDay, startDate)
    : null

  return {
    sourceAccountId,
    amountMinor,
    intervalValue,
    intervalUnit,
    startDate,
    chargeDay,
    paused,
  }
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
  const autoSaveInput = Object.prototype.hasOwnProperty.call(input, 'autoSave') ? input.autoSave : input
  const autoSave = normalizeAutoSaveConfig(autoSaveInput)
  const now = nowIso()

  await run(
    `INSERT INTO savings_jars (
      ledger_id, account_id, goal_type, target_amount_minor,
      auto_save_source_account_id, auto_save_amount_minor, auto_save_interval_value,
      auto_save_interval_unit, auto_save_start_date, auto_save_charge_day, auto_save_paused,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      ledgerId,
      accountId,
      goalType,
      targetAmountMinor,
      autoSave.sourceAccountId,
      autoSave.amountMinor,
      autoSave.intervalValue,
      autoSave.intervalUnit,
      autoSave.startDate,
      autoSave.chargeDay,
      autoSave.paused,
      now,
      now,
    ],
  )
}

export async function updateSavingsJarMeta(ledgerId, accountId, input = {}) {
  assertLedgerId(ledgerId)
  const normalizedAccountId = String(accountId ?? '').trim()
  if (!normalizedAccountId) throw new Error('缺少存錢罐帳戶 ID')
  const goalType = normalizeGoalType(input.goalType)
  const targetAmountMinor = normalizeTargetAmountMinor(goalType, input.targetAmountMinor)
  const autoSaveInput = Object.prototype.hasOwnProperty.call(input, 'autoSave') ? input.autoSave : input
  const autoSave = normalizeAutoSaveConfig(autoSaveInput)

  await run(
    `UPDATE savings_jars
     SET goal_type = ?,
         target_amount_minor = ?,
         auto_save_source_account_id = ?,
         auto_save_amount_minor = ?,
         auto_save_interval_value = ?,
         auto_save_interval_unit = ?,
         auto_save_start_date = ?,
         auto_save_charge_day = ?,
         auto_save_paused = ?,
         updated_at = ?
     WHERE ledger_id = ? AND account_id = ?;`,
    [
      goalType,
      targetAmountMinor,
      autoSave.sourceAccountId,
      autoSave.amountMinor,
      autoSave.intervalValue,
      autoSave.intervalUnit,
      autoSave.startDate,
      autoSave.chargeDay,
      autoSave.paused,
      nowIso(),
      ledgerId,
      normalizedAccountId,
    ],
  )
}
