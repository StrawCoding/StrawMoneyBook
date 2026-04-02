import { withTransaction } from '@/core/db/sqlite'
import { createAccount, deleteAccountIfUnused, findAccountById, updateAccountProfile } from '@/core/repositories/account.repo'
import { countSavingsJars, createSavingsJarMeta, isSavingsJarAccount, updateSavingsJarMeta } from '@/core/repositories/savings-jar.repo'
import { assertCanCreateSavingsJar } from '@/core/services/membership.service'
import { normalizeSubscriptionChargeDay, normalizeSubscriptionDateInput } from '@/core/utils/subscription-schedule'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeGoalType(value) {
  return normalizeText(value) === 'target' ? 'target' : 'open'
}

function normalizeCurrencyCode(value, fallback = 'TWD') {
  const text = normalizeText(value).toUpperCase()
  return /^[A-Z]{3}$/.test(text) ? text : fallback
}

function normalizeTargetAmountMinor(goalType, value) {
  if (goalType !== 'target') return null
  const amountMinor = Math.round(Number(value) || 0)
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('請輸入有效目標金額')
  }
  return amountMinor
}

function assertBaseProfile(payload = {}) {
  const name = normalizeText(payload.name)
  const groupId = normalizeText(payload.groupId)
  if (!name) throw new Error('請輸入存錢罐名稱')
  if (!groupId) throw new Error('請選擇群組')
  return { name, groupId }
}

function readSavedAutoSave(raw = {}) {
  const sourceAccountId = normalizeText(raw.savings_jar_auto_save_source_account_id ?? raw.sourceAccountId)
  const amountMinor = Number(raw.savings_jar_auto_save_amount_minor ?? raw.amountMinor)
  const startDate = normalizeSubscriptionDateInput(raw.savings_jar_auto_save_start_date ?? raw.startDate)
  if (!sourceAccountId || !Number.isInteger(amountMinor) || amountMinor <= 0 || !startDate) {
    return null
  }

  const intervalValue = Math.max(1, Math.trunc(Number(raw.savings_jar_auto_save_interval_value ?? raw.intervalValue) || 1))
  const intervalUnit = normalizeText(raw.savings_jar_auto_save_interval_unit ?? raw.intervalUnit).toLowerCase() === 'year'
    ? 'year'
    : normalizeText(raw.savings_jar_auto_save_interval_unit ?? raw.intervalUnit).toLowerCase() === 'day'
      ? 'day'
      : 'month'

  return {
    sourceAccountId,
    amountMinor,
    intervalValue,
    intervalUnit,
    startDate,
    chargeDay: intervalUnit === 'month'
      ? normalizeSubscriptionChargeDay(raw.savings_jar_auto_save_charge_day ?? raw.chargeDay, startDate)
      : null,
    paused: Number(raw.savings_jar_auto_save_paused ?? raw.paused) === 1,
  }
}

async function resolveAutoSaveConfig(ledgerId, autoSave, options = {}) {
  const fallback = options.fallback ?? null
  const input = autoSave === undefined ? fallback : autoSave
  if (input === null) return null
  if (!input || typeof input !== 'object') return null

  const sourceAccountId = normalizeText(input.sourceAccountId)
  const startDate = normalizeSubscriptionDateInput(input.startDate)
  const rawAmountMinor = input.amountMinor
  const isUnset = !sourceAccountId && (rawAmountMinor === null || rawAmountMinor === undefined || rawAmountMinor === '') && !startDate
  if (isUnset) return null

  if (!sourceAccountId) throw new Error('請選擇自動存錢來源帳戶')
  const sourceAccount = await findAccountById(ledgerId, sourceAccountId)
  if (!sourceAccount) throw new Error('找不到自動存錢來源帳戶')
  if (String(sourceAccount.id) === String(options.jarAccountId ?? '')) {
    throw new Error('自動存錢來源帳戶不可為存錢罐')
  }
  if (await isSavingsJarAccount(ledgerId, sourceAccountId)) {
    throw new Error('自動存錢來源帳戶不可為存錢罐')
  }

  const jarCurrencyCode = normalizeCurrencyCode(options.jarCurrencyCode, 'TWD')
  const sourceCurrencyCode = normalizeCurrencyCode(sourceAccount.currency_code, jarCurrencyCode)
  if (sourceCurrencyCode !== jarCurrencyCode) {
    throw new Error('自動存錢來源帳戶需與存錢罐幣別相同')
  }

  const amountMinor = Math.round(Number(rawAmountMinor) || 0)
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('請輸入有效自動存錢金額')
  }

  if (!startDate) throw new Error('請選擇自動存錢開始日期')

  const intervalValue = Math.max(1, Math.trunc(Number(input.intervalValue) || 1))
  const intervalUnit = normalizeText(input.intervalUnit).toLowerCase() === 'year'
    ? 'year'
    : normalizeText(input.intervalUnit).toLowerCase() === 'day'
      ? 'day'
      : 'month'

  return {
    sourceAccountId,
    amountMinor,
    intervalValue,
    intervalUnit,
    startDate,
    chargeDay: intervalUnit === 'month'
      ? normalizeSubscriptionChargeDay(input.chargeDay, startDate)
      : null,
    paused: input.paused === true,
  }
}

export async function createSavingsJar(ledgerId, payload = {}) {
  if (!ledgerId) throw new Error('缺少帳本 ID')

  const { name, groupId } = assertBaseProfile(payload)
  const goalType = normalizeGoalType(payload.goalType)
  const targetAmountMinor = normalizeTargetAmountMinor(goalType, payload.targetAmountMinor)
  const currencyCode = normalizeCurrencyCode(payload.currencyCode, 'TWD')
  const existingCount = await countSavingsJars(ledgerId)
  assertCanCreateSavingsJar(existingCount)

  return withTransaction(async () => {
    const account = await createAccount(ledgerId, {
      groupId,
      name,
      accountType: 'asset',
      allowNegative: false,
      openingBalanceMinor: 0,
      currencyCode,
      icon: payload.icon ?? 'fa-solid fa-piggy-bank',
      includeInAssets: payload.includeInAssets === true,
      sortOrder: payload.sortOrder ?? 0,
    })

    const autoSave = await resolveAutoSaveConfig(ledgerId, payload.autoSave, {
      jarAccountId: account.id,
      jarCurrencyCode: currencyCode,
    })

    await createSavingsJarMeta(ledgerId, {
      accountId: account.id,
      goalType,
      targetAmountMinor,
      autoSave,
    })

    return account.id
  })
}

export async function updateSavingsJar(ledgerId, accountId, payload = {}) {
  if (!ledgerId) throw new Error('缺少帳本 ID')
  const normalizedAccountId = normalizeText(accountId)
  if (!normalizedAccountId) throw new Error('缺少存錢罐帳戶 ID')
  const existing = await findAccountById(ledgerId, normalizedAccountId)
  if (!existing) throw new Error('找不到存錢罐')
  if (!(await isSavingsJarAccount(ledgerId, normalizedAccountId))) {
    throw new Error('指定帳戶不是存錢罐')
  }

  const { name, groupId } = assertBaseProfile(payload)
  const goalType = normalizeGoalType(payload.goalType)
  const targetAmountMinor = normalizeTargetAmountMinor(goalType, payload.targetAmountMinor)
  const currencyCode = normalizeCurrencyCode(payload.currencyCode ?? existing.currency_code, 'TWD')
  const currentAutoSave = readSavedAutoSave(existing)
  const autoSave = await resolveAutoSaveConfig(ledgerId, payload.autoSave, {
    fallback: currentAutoSave,
    jarAccountId: normalizedAccountId,
    jarCurrencyCode: currencyCode,
  })

  await withTransaction(async () => {
    await updateAccountProfile(ledgerId, normalizedAccountId, {
      name,
      groupId,
      icon: payload.icon ?? existing.icon,
      currencyCode,
      openingBalanceMinor: Number(existing.opening_balance_minor ?? 0),
      includeInAssets: payload.includeInAssets === true,
    })

    await updateSavingsJarMeta(ledgerId, normalizedAccountId, {
      goalType,
      targetAmountMinor,
      autoSave,
    })
  })
}

export async function deleteSavingsJarAutoSave(ledgerId, accountId) {
  if (!ledgerId) throw new Error('缺少帳本 ID')
  const normalizedAccountId = normalizeText(accountId)
  if (!normalizedAccountId) throw new Error('缺少存錢罐帳戶 ID')

  const existing = await findAccountById(ledgerId, normalizedAccountId)
  if (!existing) throw new Error('找不到存錢罐')
  if (!(await isSavingsJarAccount(ledgerId, normalizedAccountId))) {
    throw new Error('指定帳戶不是存錢罐')
  }

  await updateSavingsJarMeta(ledgerId, normalizedAccountId, {
    goalType: existing.savings_jar_goal_type,
    targetAmountMinor: existing.savings_jar_target_amount_minor,
    autoSave: null,
  })
}

export async function deleteSavingsJar(ledgerId, accountId) {
  if (!ledgerId) throw new Error('缺少帳本 ID')
  const normalizedAccountId = normalizeText(accountId)
  if (!normalizedAccountId) throw new Error('缺少存錢罐帳戶 ID')

  const existing = await findAccountById(ledgerId, normalizedAccountId)
  if (!existing) throw new Error('找不到存錢罐')
  if (!(await isSavingsJarAccount(ledgerId, normalizedAccountId))) {
    throw new Error('指定帳戶不是存錢罐')
  }

  return deleteAccountIfUnused(ledgerId, normalizedAccountId)
}
