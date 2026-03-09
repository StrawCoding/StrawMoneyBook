import { withTransaction } from '@/core/db/sqlite'
import { createId, nowIso } from '@/core/utils/id'
import { ensureCounterpartyByName } from '@/core/repositories/counterparty.repo'
import {
  addTransaction,
  findTransactionRecordById,
  findReimbursementSettlementIncomeTx,
  markTransactionReimbursed,
  softDeleteTransactionById,
} from '@/core/repositories/transaction.repo'
import {
  listAccounts,
} from '@/core/repositories/account.repo'
import {
  archiveCategory,
  createCategory,
  createCategoryGroup,
  listCategories,
  listCategoryGroups,
  updateCategoryIcon,
} from '@/core/repositories/category.repo'
import {
  countReimbursements,
  createReimbursementAdvance,
  createReimbursementAdvanceUsage,
  createReimbursement,
  createReimbursementItem,
  deleteReimbursementById,
  deleteReimbursementAdvanceUsagesByExpenseTx,
  getReimbursementAdvanceById,
  findTransactionByIdempotencyKey,
  getReimbursementById,
  listReimbursementAdvanceUsagesByExpenseTx,
  listReimbursementAdvances,
  listReimbursementItems,
  listReimbursements,
  recomputeReimbursementTotal,
  setReimbursementPaid,
  softDeleteReimbursementAdvanceById,
  updateReimbursementAdvanceUsedMinor,
  updateReimbursementStatus,
} from '@/core/repositories/reimbursement.repo'
import { assertCanCreateReimbursement, isFreeTier } from '@/core/services/membership.service'

const ADDON_NOTE_PREFIX = '【附加項目】'

function normalizeTargetLedgerIds(activeLedgerId, rawList) {
  if (!Array.isArray(rawList)) return []
  const ids = Array.from(new Set(rawList.map((value) => String(value ?? '').trim()).filter(Boolean)))
  return ids.filter((id) => id !== activeLedgerId)
}

async function ensureCategoryInTargetLedger(sourceTx, targetLedgerId) {
  if (!sourceTx?.category_name) return null

  const targetCategories = await listCategories(targetLedgerId, { includeArchived: true })
  const sourceKind = sourceTx.category_kind || 'expense'
  const matched = targetCategories.find(
    (item) =>
      item.name === sourceTx.category_name &&
      (item.kind === sourceKind || item.kind === 'both' || sourceKind === 'both'),
  )
  if (matched) return matched.id

  const targetGroups = await listCategoryGroups(targetLedgerId)
  const sourceGroupName = sourceTx.category_group_name || (sourceKind === 'income' ? '收入' : '支出')
  const sourceGroupKind = sourceTx.category_group_kind || sourceKind
  let targetGroup = targetGroups.find((item) => item.name === sourceGroupName && item.kind === sourceGroupKind)
  if (!targetGroup) {
    targetGroup = await createCategoryGroup(targetLedgerId, {
      name: sourceGroupName,
      kind: sourceGroupKind,
      sortOrder: targetGroups.length,
    })
  }

  const sameGroupCategories = targetCategories.filter((item) => item.group_id === targetGroup.id)
  const copied = await createCategory(targetLedgerId, {
    groupId: targetGroup.id,
    name: sourceTx.category_name,
    kind: sourceKind,
    icon: sourceTx.category_icon || undefined,
    isBudgetable: sourceKind === 'income' ? 0 : 1,
    sortOrder: sameGroupCategories.length,
  })

  return copied.id
}

async function findTargetAccountId(sourceTx, targetLedgerId) {
  const targetAccounts = await listAccounts(targetLedgerId)
  if (!targetAccounts.length) {
    throw new Error('目標帳本沒有可用帳戶')
  }

  if (sourceTx?.account_name) {
    const sameName = targetAccounts.find((item) => item.name === sourceTx.account_name)
    if (sameName) return sameName.id
  }

  return targetAccounts[0].id
}

async function copyExpenseToTargetLedgers(sourceLedgerId, sourceTx, payload = {}) {
  if (isFreeTier()) return { requested: 0, copied: 0, skipped: 0 }
  const targetLedgerIds = normalizeTargetLedgerIds(sourceLedgerId, payload.copyToLedgerIds)
  if (!targetLedgerIds.length) return { requested: 0, copied: 0, skipped: 0 }
  if (!sourceTx) throw new Error('找不到來源交易')

  const occurredAt = payload.copyOccurredAt ?? payload.occurredAt ?? sourceTx.occurred_at ?? nowIso()
  const noteWithDate = buildCopiedExpenseNote(sourceTx.note, occurredAt)
  const settledAmountMinor = Math.round(Number(payload.amountMinor ?? 0))
  const fallbackSourceMinor = Math.abs(Math.round(Number(sourceTx.amount_minor ?? 0)))
  const copiedExpenseAmountMinor = (settledAmountMinor > 0 ? settledAmountMinor : fallbackSourceMinor) * -1
  let copied = 0
  let skipped = 0

  for (const targetLedgerId of targetLedgerIds) {
    const idempotencyKey = `reim_copy_${sourceLedgerId}_${sourceTx.id}_${targetLedgerId}`
    const existing = await findTransactionByIdempotencyKey(targetLedgerId, idempotencyKey)
    if (existing) {
      skipped += 1
      continue
    }

    const accountId = await findTargetAccountId(sourceTx, targetLedgerId)
    const categoryId = await ensureCategoryInTargetLedger(sourceTx, targetLedgerId)

    await addTransaction(targetLedgerId, {
      type: 'expense',
      accountId,
      categoryId,
      amountMinor: copiedExpenseAmountMinor,
      occurredAt,
      note: noteWithDate,
      originType: 'manual',
      externalRefId: sourceTx.id,
      idempotencyKey,
      includeInBudget: true,
      includeInAnalysis: true,
      isReimbursable: false,
      reimbursementState: 'none',
    })
    copied += 1
  }

  return {
    requested: targetLedgerIds.length,
    copied,
    skipped,
  }
}

const ALLOWED_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['in_review', 'approved', 'rejected'],
  in_review: ['approved', 'rejected'],
  approved: ['paid', 'rejected'],
  rejected: ['draft'],
  paid: [],
}

function normalizeAmountMinor(amountMinor) {
  const value = Math.round(Number(amountMinor))
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('金額必須大於 0')
  }
  return value
}

function normalizeReimbursementItemEntryType(value) {
  return String(value ?? '').trim() === 'income' ? 'income' : 'expense'
}

function toDateKey(isoLike) {
  const date = new Date(isoLike || nowIso())
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function appendDateToNote(note, occurredAt) {
  const dateKey = toDateKey(occurredAt)
  const text = String(note ?? '').trim() || '報銷入帳'
  if (!dateKey) return text
  if (text.startsWith(dateKey)) return text
  return `${dateKey} ${text}`
}

function buildCopiedExpenseNote(sourceNote, occurredAt) {
  const dateKey = toDateKey(occurredAt)
  const originalNote = stripAddonSummaryFromNote(sourceNote)
  if (!dateKey) return originalNote
  if (!originalNote) return dateKey
  if (originalNote.startsWith(dateKey)) return originalNote
  return `${dateKey} ${originalNote}`
}

function stripAddonSummaryFromNote(note) {
  return String(note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(ADDON_NOTE_PREFIX))
    .join('\n')
}

function normalizeAdvanceIds(rawList) {
  if (!Array.isArray(rawList)) return []
  return Array.from(new Set(rawList.map((item) => String(item ?? '').trim()).filter(Boolean)))
}

function buildAdvanceTransactionNote(note) {
  const text = String(note ?? '').trim()
  return text || '報銷代收'
}

function assertCanTransition(currentStatus, nextStatus) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? []
  if (!allowed.includes(nextStatus)) {
    throw new Error(`狀態不可由 ${currentStatus} 轉為 ${nextStatus}`)
  }
}

async function ensureHiddenSystemIncomeCategory(ledgerId, name, icon) {
  const categories = await listCategories(ledgerId, { includeArchived: true })
  const categoryName = String(name ?? '').trim()
  const existing = categories.find((item) => item.name === categoryName && (item.kind === 'income' || item.kind === 'both'))
  if (existing) {
    if (icon && String(existing.icon ?? '').trim() !== icon) {
      await updateCategoryIcon(ledgerId, existing.id, icon)
    }
    if (!Number(existing.is_archived)) {
      await archiveCategory(ledgerId, existing.id)
    }
    return existing.id
  }

  const groups = await listCategoryGroups(ledgerId)
  let group = groups.find((item) => (item.kind === 'income' || item.kind === 'both') && !Number(item.is_archived))

  if (!group) {
    group = await createCategoryGroup(ledgerId, {
      name: '收入',
      kind: 'income',
      sortOrder: groups.length,
    })
  }

  const created = await createCategory(ledgerId, {
    groupId: group.id,
    name: categoryName,
    kind: 'income',
    icon: icon || undefined,
    isBudgetable: 0,
    sortOrder: categories.filter((item) => item.group_id === group.id).length,
  })
  await archiveCategory(ledgerId, created.id)
  return created.id
}

async function ensureHiddenReimbursementCategory(ledgerId) {
  return ensureHiddenSystemIncomeCategory(ledgerId, '報銷', 'fa-solid fa-receipt')
}

async function ensureHiddenAdvanceCategory(ledgerId) {
  return ensureHiddenSystemIncomeCategory(ledgerId, '代收', 'fa-solid fa-hand-holding-dollar')
}

export async function loadReimbursementDashboard(ledgerId) {
  const claims = await listReimbursements(ledgerId)
  const pendingCount = claims.filter((item) => item.status !== 'paid' && item.status !== 'rejected').length
  const pendingTotal = claims
    .filter((item) => item.status !== 'paid' && item.status !== 'rejected')
    .reduce((total, item) => total + Number(item.total_minor ?? 0), 0)

  return {
    claims,
    summary: {
      pendingCount,
      pendingTotal,
    },
  }
}

export async function listReimbursementAdvancesData(ledgerId) {
  return listReimbursementAdvances(ledgerId, { activeOnly: false })
}

export async function createReimbursementAdvanceEntry(ledgerId, payload = {}) {
  const accountId = String(payload.accountId ?? '').trim()
  if (!accountId) {
    throw new Error('代收必須指定帳戶')
  }
  const categoryId = String(payload.categoryId ?? '').trim()
  if (!categoryId) {
    throw new Error('代收必須指定分類')
  }
  const categories = await listCategories(ledgerId, { includeArchived: false })
  const matchedCategory = categories.find((item) => String(item?.id ?? '').trim() === categoryId)
  if (!matchedCategory || !['expense', 'both'].includes(String(matchedCategory.kind ?? ''))) {
    throw new Error('代收分類無效')
  }

  const amountMinor = normalizeAmountMinor(payload.amountMinor)

  return withTransaction(async () => {
    const advanceId = createId('radv')
    const receivedAt = payload.receivedAt ?? nowIso()
    const note = buildAdvanceTransactionNote(payload.note)
    const advanceCategoryId = await ensureHiddenAdvanceCategory(ledgerId)
    const txId = await addTransaction(ledgerId, {
      type: 'income',
      accountId,
      categoryId: advanceCategoryId,
      amountMinor,
      occurredAt: receivedAt,
      note,
      originType: 'manual',
      externalRefId: advanceId,
      idempotencyKey: `reim_adv_${advanceId}`,
      includeInBudget: false,
      includeInAnalysis: false,
    })

    return createReimbursementAdvance(ledgerId, {
      id: advanceId,
      accountId,
      categoryId,
      sourceTxId: txId,
      amountMinor,
      note,
      receivedAt,
    })
  })
}

export async function deleteReimbursementAdvanceEntry(ledgerId, advanceId) {
  const normalizedAdvanceId = String(advanceId ?? '').trim()
  if (!normalizedAdvanceId) {
    throw new Error('advanceId 為必填')
  }

  return withTransaction(async () => {
    const advance = await getReimbursementAdvanceById(ledgerId, normalizedAdvanceId)
    if (!advance) {
      throw new Error('找不到代收資料')
    }

    const usedMinor = Math.max(0, Math.round(Number(advance.used_minor ?? 0)))
    if (usedMinor > 0) {
      throw new Error('已有抵扣紀錄的代收不可刪除')
    }

    await softDeleteReimbursementAdvanceById(ledgerId, normalizedAdvanceId)

    const sourceTxId = String(advance.source_tx_id ?? '').trim()
    if (sourceTxId) {
      await softDeleteTransactionById(ledgerId, sourceTxId)
    }

    return {
      deleted: true,
      advanceId: normalizedAdvanceId,
      sourceTxId,
    }
  })
}

export async function createReimbursementDraft(ledgerId, payload) {
  if (!payload.title?.trim()) {
    throw new Error('請輸入標題')
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error('至少需要一筆明細')
  }

  const existingReimbursementCount = await countReimbursements(ledgerId)
  assertCanCreateReimbursement(existingReimbursementCount)

  return withTransaction(async () => {
    const counterpartyId = await ensureCounterpartyByName(ledgerId, payload.counterpartyName ?? '')

    const claim = await createReimbursement(ledgerId, {
      title: payload.title.trim(),
      counterpartyId,
      status: 'draft',
      note: payload.note ?? null,
    })

    for (const [index, item] of payload.items.entries()) {
      const amountMinor = normalizeAmountMinor(item.amountMinor)
      await createReimbursementItem(ledgerId, {
        reimbursementId: claim.id,
        sourceType: item.sourceType ?? 'manual',
        entryType: normalizeReimbursementItemEntryType(item.entryType),
        transactionId: item.transactionId ?? null,
        categoryId: item.categoryId ?? null,
        accountId: item.accountId ?? null,
        description: item.description ?? `明細 ${index + 1}`,
        amountMinor,
        occurredAt: item.occurredAt ?? nowIso(),
      })
    }

    return recomputeReimbursementTotal(ledgerId, claim.id)
  })
}

export async function getReimbursementDetail(ledgerId, reimbursementId) {
  const claim = await getReimbursementById(ledgerId, reimbursementId)
  if (!claim) {
    throw new Error('找不到資料')
  }

  const items = await listReimbursementItems(ledgerId, reimbursementId)
  return { claim, items }
}

export async function transitionReimbursementStatus(ledgerId, reimbursementId, nextStatus) {
  return withTransaction(async () => {
    const claim = await getReimbursementById(ledgerId, reimbursementId)
    if (!claim) {
      throw new Error('找不到資料')
    }

    assertCanTransition(claim.status, nextStatus)

    if (nextStatus === 'paid') {
      throw new Error('paid 狀態請使用入帳流程')
    }

    return updateReimbursementStatus(ledgerId, reimbursementId, nextStatus)
  })
}

export async function deleteReimbursement(ledgerId, reimbursementId) {
  return withTransaction(async () => {
    const claim = await getReimbursementById(ledgerId, reimbursementId)
    if (!claim) {
      throw new Error('找不到資料')
    }

    const claimItems = await listReimbursementItems(ledgerId, claim.id)
    for (const item of claimItems) {
      const txId = String(item?.transaction_id ?? '').trim()
      if (!txId) continue
      await restoreAdvanceUsages(ledgerId, txId)
      await markTransactionReimbursed(ledgerId, txId, false)
    }

    if (claim.status === 'paid' && claim.paid_tx_id) {
      await softDeleteTransactionById(ledgerId, claim.paid_tx_id)
    }

    await deleteReimbursementById(ledgerId, reimbursementId)
    return { deleted: true, reimbursementId }
  })
}

function listClaimOffsettableItems(claimItems = []) {
  return claimItems.filter((item) => {
    const txId = String(item?.transaction_id ?? '').trim()
    if (!txId) return false
    if (String(item?.entry_type ?? '') === 'income') return false
    return Math.max(0, Math.round(Number(item?.amount_minor ?? 0))) > 0
  })
}

async function applyClaimAdvanceUsages(ledgerId, claimItems, totalMinor, selectedAdvanceIds = []) {
  const normalizedIds = normalizeAdvanceIds(selectedAdvanceIds)
  if (!normalizedIds.length || totalMinor <= 0) {
    return {
      usedAdvanceMinor: 0,
      usedAdvanceIds: [],
      cashAmountMinor: totalMinor,
    }
  }

  let remainingClaimMinor = totalMinor
  let usedAdvanceMinor = 0
  const usedAdvanceIds = new Set()

  for (const item of listClaimOffsettableItems(claimItems)) {
    if (remainingClaimMinor <= 0) break

    const txId = String(item.transaction_id ?? '').trim()
    const itemMinor = Math.max(0, Math.round(Number(item.amount_minor ?? 0)))
    const offsettableMinor = Math.min(itemMinor, remainingClaimMinor)
    if (!txId || offsettableMinor <= 0) continue

    const result = await applyAdvanceUsages(ledgerId, txId, offsettableMinor, normalizedIds)
    usedAdvanceMinor += result.usedAdvanceMinor
    remainingClaimMinor = Math.max(0, remainingClaimMinor - result.usedAdvanceMinor)
    for (const advanceId of result.usedAdvanceIds) {
      usedAdvanceIds.add(advanceId)
    }
  }

  return {
    usedAdvanceMinor,
    usedAdvanceIds: Array.from(usedAdvanceIds),
    cashAmountMinor: Math.max(0, totalMinor - usedAdvanceMinor),
  }
}

export async function markReimbursementPaid(ledgerId, payload) {
  if (!payload.reimbursementId) {
    throw new Error('reimbursementId 為必填')
  }

  return withTransaction(async () => {
    const claim = await getReimbursementById(ledgerId, payload.reimbursementId)
    if (!claim) {
      throw new Error('找不到資料')
    }

    if (!['approved', 'in_review', 'submitted', 'paid'].includes(claim.status)) {
      throw new Error(`狀態 ${claim.status} 不能入帳`)
    }

    const idempotencyKey = `reim_paid_${claim.id}`

    const claimItems = await listReimbursementItems(ledgerId, claim.id)

    async function syncLinkedReimbursableTransactions() {
      for (const item of claimItems) {
        const txId = String(item?.transaction_id ?? '').trim()
        if (!txId) continue
        await markTransactionReimbursed(ledgerId, txId, true)
      }
    }

    if (claim.status === 'paid') {
      await syncLinkedReimbursableTransactions()
      return {
        alreadyProcessed: true,
        reimbursementId: claim.id,
        paidTxId: claim.paid_tx_id ?? '',
        usedAdvanceMinor: 0,
        cashAmountMinor: Math.max(0, Math.round(Number(claim.total_minor ?? 0))),
      }
    }

    const existingTx = await findTransactionByIdempotencyKey(ledgerId, idempotencyKey)
    if (existingTx) {
      const updated = await setReimbursementPaid(ledgerId, claim.id, {
        paidTxId: existingTx.id,
        idempotencyKey,
      })
      await syncLinkedReimbursableTransactions()
      return {
        alreadyProcessed: true,
        reimbursementId: updated.id,
        paidTxId: existingTx.id,
      }
    }

    const totalMinor = Number(claim.total_minor ?? 0)
    if (totalMinor <= 0) {
      throw new Error('總額必須大於 0 才能入帳')
    }

    const advanceResult = await applyClaimAdvanceUsages(
      ledgerId,
      claimItems,
      totalMinor,
      payload.selectedAdvanceIds,
    )
    let txId = ''

    if (advanceResult.cashAmountMinor > 0) {
      if (!payload.accountId) {
        throw new Error('入帳必須指定帳戶')
      }

      txId = await addTransaction(ledgerId, {
        type: 'income',
        accountId: payload.accountId,
        categoryId: payload.categoryId ?? null,
        amountMinor: advanceResult.cashAmountMinor,
        occurredAt: payload.paidAt ?? nowIso(),
        note: payload.note ?? `報銷入帳：${claim.title}`,
        originType: 'reimbursement',
        externalRefId: claim.id,
        idempotencyKey,
        includeInBudget: false,
        includeInAnalysis: false,
      })
    }

    const updated = await setReimbursementPaid(ledgerId, claim.id, {
      paidTxId: txId || null,
      idempotencyKey,
    })
    await syncLinkedReimbursableTransactions()

    return {
      alreadyProcessed: false,
      reimbursementId: updated.id,
      paidTxId: txId,
      usedAdvanceMinor: advanceResult.usedAdvanceMinor,
      usedAdvanceIds: advanceResult.usedAdvanceIds,
      cashAmountMinor: advanceResult.cashAmountMinor,
    }
  })
}

async function restoreAdvanceUsages(ledgerId, expenseTxId) {
  const usages = await listReimbursementAdvanceUsagesByExpenseTx(ledgerId, expenseTxId)
  if (!usages.length) return usages

  for (const usage of usages) {
    const advance = await getReimbursementAdvanceById(ledgerId, usage.advance_id)
    if (!advance) continue
    const currentUsedMinor = Math.max(0, Math.round(Number(advance.used_minor ?? 0)))
    const restoreMinor = Math.max(0, Math.round(Number(usage.amount_minor ?? 0)))
    const nextUsedMinor = Math.max(0, currentUsedMinor - restoreMinor)
    await updateReimbursementAdvanceUsedMinor(ledgerId, advance.id, nextUsedMinor)
  }

  await deleteReimbursementAdvanceUsagesByExpenseTx(ledgerId, expenseTxId)
  return usages
}

async function applyAdvanceUsages(ledgerId, expenseTxId, amountMinor, selectedAdvanceIds = []) {
  const normalizedIds = normalizeAdvanceIds(selectedAdvanceIds)
  if (!normalizedIds.length || amountMinor <= 0) {
    return {
      usedAdvanceMinor: 0,
      usedAdvanceIds: [],
      cashAmountMinor: amountMinor,
    }
  }

  let remainingMinor = amountMinor
  let usedAdvanceMinor = 0
  const usedAdvanceIds = []

  for (const advanceId of normalizedIds) {
    if (remainingMinor <= 0) break
    const advance = await getReimbursementAdvanceById(ledgerId, advanceId)
    if (!advance) continue

    const currentUsedMinor = Math.max(0, Math.round(Number(advance.used_minor ?? 0)))
    const totalMinor = Math.max(0, Math.round(Number(advance.amount_minor ?? 0)))
    const availableMinor = Math.max(0, totalMinor - currentUsedMinor)
    if (availableMinor <= 0) continue

    const appliedMinor = Math.min(availableMinor, remainingMinor)
    if (appliedMinor <= 0) continue

    await updateReimbursementAdvanceUsedMinor(ledgerId, advanceId, currentUsedMinor + appliedMinor)
    await createReimbursementAdvanceUsage(ledgerId, {
      advanceId,
      expenseTxId,
      amountMinor: appliedMinor,
    })

    remainingMinor -= appliedMinor
    usedAdvanceMinor += appliedMinor
    usedAdvanceIds.push(advanceId)
  }

  return {
    usedAdvanceMinor,
    usedAdvanceIds,
    cashAmountMinor: remainingMinor,
  }
}

export async function settleReimbursableExpense(ledgerId, payload) {
  if (!payload?.txId) {
    throw new Error('txId 為必填')
  }

  const amountMinor = Math.round(Number(payload.amountMinor ?? 0))
  const allowUpdate = payload?.allowUpdate === true
  const selectedAdvanceIds = normalizeAdvanceIds(payload?.selectedAdvanceIds)

  return withTransaction(async () => {
    const sourceTx = await findTransactionRecordById(ledgerId, payload.txId)
    if (!sourceTx) {
      throw new Error('找不到來源交易')
    }

    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      throw new Error('報銷金額必須大於 0')
    }

    const existing = await findReimbursementSettlementIncomeTx(ledgerId, payload.txId)
    const existingAdvanceUsages = await listReimbursementAdvanceUsagesByExpenseTx(ledgerId, payload.txId)
    const hasExistingSettlement = Boolean(existing) || existingAdvanceUsages.length > 0

    if (hasExistingSettlement) {
      if (!allowUpdate) {
        await markTransactionReimbursed(ledgerId, payload.txId, true)
        const existingAdvanceMinor = existingAdvanceUsages.reduce((sum, item) => {
          return sum + Math.max(0, Math.round(Number(item.amount_minor ?? 0)))
        }, 0)
        return {
          marked: true,
          createdIncome: Boolean(existing),
          alreadyExists: true,
          incomeTxId: existing?.id ?? '',
          usedAdvanceMinor: existingAdvanceMinor,
          cashAmountMinor: Math.max(0, amountMinor - existingAdvanceMinor),
        }
      }
      if (existing?.id) {
        await softDeleteTransactionById(ledgerId, existing.id)
      }
      await restoreAdvanceUsages(ledgerId, payload.txId)
    }

    await markTransactionReimbursed(ledgerId, payload.txId, true)

    const advanceResult = await applyAdvanceUsages(ledgerId, payload.txId, amountMinor, selectedAdvanceIds)
    const occurredAt = payload.occurredAt ?? nowIso()
    const noteWithDate = appendDateToNote(payload.note, occurredAt)
    let incomeTxId = ''

    if (advanceResult.cashAmountMinor > 0) {
      if (!payload.accountId) {
        throw new Error('請選擇入帳帳戶')
      }

      const reimbursementCategoryId = await ensureHiddenReimbursementCategory(ledgerId)
      incomeTxId = await addTransaction(ledgerId, {
        type: 'income',
        accountId: payload.accountId,
        categoryId: reimbursementCategoryId,
        amountMinor: advanceResult.cashAmountMinor,
        occurredAt,
        note: noteWithDate,
        originType: 'reimbursement',
        externalRefId: payload.txId,
        includeInBudget: false,
        includeInAnalysis: false,
      })
    }

    const copiedResult = await copyExpenseToTargetLedgers(ledgerId, sourceTx, payload)

    return {
      marked: true,
      createdIncome: Boolean(incomeTxId),
      updatedIncome: Boolean(existing && allowUpdate),
      incomeTxId,
      usedAdvanceMinor: advanceResult.usedAdvanceMinor,
      usedAdvanceIds: advanceResult.usedAdvanceIds,
      cashAmountMinor: advanceResult.cashAmountMinor,
      copiedLedgers: copiedResult.copied,
      skippedLedgers: copiedResult.skipped,
      requestedCopyLedgers: copiedResult.requested,
    }
  })
}

export async function getReimbursementOffsetDetail(ledgerId, expenseTxId) {
  if (!expenseTxId) {
    throw new Error('expenseTxId 為必填')
  }

  const [sourceTx, cashTx, usages] = await Promise.all([
    findTransactionRecordById(ledgerId, expenseTxId),
    findReimbursementSettlementIncomeTx(ledgerId, expenseTxId),
    listReimbursementAdvanceUsagesByExpenseTx(ledgerId, expenseTxId),
  ])

  if (!sourceTx) {
    throw new Error('找不到來源交易')
  }

  const offsetMinor = usages.reduce((sum, item) => {
    return sum + Math.max(0, Math.round(Number(item.amount_minor ?? 0)))
  }, 0)
  const cashMinor = Math.max(0, Math.round(Number(cashTx?.amount_minor ?? 0)))

  return {
    sourceTx,
    cashTx: cashTx ? { ...cashTx, amount_minor: cashMinor } : null,
    usages,
    offsetMinor,
    cashMinor,
    settledMinor: offsetMinor + cashMinor,
  }
}

export async function cancelReimbursableExpenseSettlement(ledgerId, txId) {
  if (!txId) {
    throw new Error('txId 為必填')
  }

  return withTransaction(async () => {
    const sourceTx = await findTransactionRecordById(ledgerId, txId)
    if (!sourceTx) {
      throw new Error('找不到來源交易')
    }

    await markTransactionReimbursed(ledgerId, txId, false)
    const incomeTx = await findReimbursementSettlementIncomeTx(ledgerId, txId)
    if (incomeTx?.id) {
      await softDeleteTransactionById(ledgerId, incomeTx.id)
    }
    const restoredUsages = await restoreAdvanceUsages(ledgerId, txId)
    const restoredAdvanceMinor = restoredUsages.reduce((sum, item) => {
      return sum + Math.max(0, Math.round(Number(item.amount_minor ?? 0)))
    }, 0)

    return {
      unmarked: true,
      removedIncome: Boolean(incomeTx?.id),
      incomeTxId: incomeTx?.id ?? '',
      restoredAdvanceMinor,
    }
  })
}
