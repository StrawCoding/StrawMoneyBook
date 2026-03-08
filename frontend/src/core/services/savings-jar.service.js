import { withTransaction } from '@/core/db/sqlite'
import { createAccount, deleteAccountIfUnused, findAccountById, updateAccountProfile } from '@/core/repositories/account.repo'
import { countSavingsJars, createSavingsJarMeta, isSavingsJarAccount, updateSavingsJarMeta } from '@/core/repositories/savings-jar.repo'
import { assertCanCreateSavingsJar } from '@/core/services/membership.service'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeGoalType(value) {
  return normalizeText(value) === 'target' ? 'target' : 'open'
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

export async function createSavingsJar(ledgerId, payload = {}) {
  if (!ledgerId) throw new Error('缺少帳本 ID')

  const { name, groupId } = assertBaseProfile(payload)
  const goalType = normalizeGoalType(payload.goalType)
  const targetAmountMinor = normalizeTargetAmountMinor(goalType, payload.targetAmountMinor)
  const existingCount = await countSavingsJars(ledgerId)
  assertCanCreateSavingsJar(existingCount)

  return withTransaction(async () => {
    const account = await createAccount(ledgerId, {
      groupId,
      name,
      accountType: 'asset',
      allowNegative: false,
      openingBalanceMinor: 0,
      currencyCode: payload.currencyCode ?? 'TWD',
      icon: payload.icon ?? 'fa-solid fa-piggy-bank',
      includeInAssets: payload.includeInAssets === true,
      sortOrder: payload.sortOrder ?? 0,
    })

    await createSavingsJarMeta(ledgerId, {
      accountId: account.id,
      goalType,
      targetAmountMinor,
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

  await withTransaction(async () => {
    await updateAccountProfile(ledgerId, normalizedAccountId, {
      name,
      groupId,
      icon: payload.icon ?? existing.icon,
      currencyCode: payload.currencyCode ?? existing.currency_code,
      openingBalanceMinor: Number(existing.opening_balance_minor ?? 0),
      includeInAssets: payload.includeInAssets === true,
    })

    await updateSavingsJarMeta(ledgerId, normalizedAccountId, {
      goalType,
      targetAmountMinor,
    })
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
