import { withTransaction } from '@/core/db/sqlite'
import { nowIso } from '@/core/utils/id'
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
} from '@/core/repositories/category.repo'
import {
  countReimbursements,
  createReimbursement,
  createReimbursementItem,
  findTransactionByIdempotencyKey,
  getReimbursementById,
  listReimbursementItems,
  listReimbursements,
  recomputeReimbursementTotal,
  setReimbursementPaid,
  updateReimbursementStatus,
} from '@/core/repositories/reimbursement.repo'
import { assertCanCreateReimbursement, isFreeTier } from '@/core/services/membership.service'

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
      amountMinor: Number(sourceTx.amount_minor ?? 0),
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
  const originalNote = String(sourceNote ?? '').trim()
  if (!dateKey) return originalNote
  if (!originalNote) return dateKey
  if (originalNote.startsWith(dateKey)) return originalNote
  return `${dateKey} ${originalNote}`
}

function assertCanTransition(currentStatus, nextStatus) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? []
  if (!allowed.includes(nextStatus)) {
    throw new Error(`狀態不可由 ${currentStatus} 轉為 ${nextStatus}`)
  }
}

async function ensureHiddenReimbursementCategory(ledgerId) {
  const categories = await listCategories(ledgerId, { includeArchived: true })
  const existing = categories.find((item) => item.name === '報銷' && (item.kind === 'income' || item.kind === 'both'))
  if (existing) {
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
    name: '報銷',
    kind: 'income',
    isBudgetable: 0,
    sortOrder: categories.filter((item) => item.group_id === group.id).length,
  })
  await archiveCategory(ledgerId, created.id)
  return created.id
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

export async function createReimbursementDraft(ledgerId, payload) {
  if (!payload.title?.trim()) {
    throw new Error('請輸入報銷標題')
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error('至少需要一筆報銷明細')
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
    throw new Error('找不到報銷資料')
  }

  const items = await listReimbursementItems(ledgerId, reimbursementId)
  return { claim, items }
}

export async function transitionReimbursementStatus(ledgerId, reimbursementId, nextStatus) {
  return withTransaction(async () => {
    const claim = await getReimbursementById(ledgerId, reimbursementId)
    if (!claim) {
      throw new Error('找不到報銷資料')
    }

    assertCanTransition(claim.status, nextStatus)

    if (nextStatus === 'paid') {
      throw new Error('paid 狀態請使用入帳流程')
    }

    return updateReimbursementStatus(ledgerId, reimbursementId, nextStatus)
  })
}

export async function markReimbursementPaid(ledgerId, payload) {
  if (!payload.reimbursementId) {
    throw new Error('reimbursementId 為必填')
  }

  if (!payload.accountId) {
    throw new Error('報銷入帳必須指定帳戶')
  }

  return withTransaction(async () => {
    const claim = await getReimbursementById(ledgerId, payload.reimbursementId)
    if (!claim) {
      throw new Error('找不到報銷資料')
    }

    if (!['approved', 'in_review', 'submitted', 'paid'].includes(claim.status)) {
      throw new Error(`狀態 ${claim.status} 不能入帳`)
    }

    const idempotencyKey = `reim_paid_${claim.id}`

    if (claim.status === 'paid' && claim.paid_tx_id) {
      return {
        alreadyProcessed: true,
        reimbursementId: claim.id,
        paidTxId: claim.paid_tx_id,
      }
    }

    const existingTx = await findTransactionByIdempotencyKey(ledgerId, idempotencyKey)
    if (existingTx) {
      const updated = await setReimbursementPaid(ledgerId, claim.id, {
        paidTxId: existingTx.id,
        idempotencyKey,
      })
      return {
        alreadyProcessed: true,
        reimbursementId: updated.id,
        paidTxId: existingTx.id,
      }
    }

    const totalMinor = Number(claim.total_minor ?? 0)
    if (totalMinor <= 0) {
      throw new Error('報銷總額必須大於 0 才能入帳')
    }

    const txId = await addTransaction(ledgerId, {
      type: 'income',
      accountId: payload.accountId,
      categoryId: payload.categoryId ?? null,
      amountMinor: totalMinor,
      occurredAt: payload.paidAt ?? nowIso(),
      note: payload.note ?? `報銷入帳：${claim.title}`,
      originType: 'reimbursement',
      externalRefId: claim.id,
      idempotencyKey,
      includeInBudget: false,
      includeInAnalysis: false,
    })

    const updated = await setReimbursementPaid(ledgerId, claim.id, {
      paidTxId: txId,
      idempotencyKey,
    })

    return {
      alreadyProcessed: false,
      reimbursementId: updated.id,
      paidTxId: txId,
    }
  })
}

export async function settleReimbursableExpense(ledgerId, payload) {
  if (!payload?.txId) {
    throw new Error('txId 為必填')
  }

  const amountMinor = Math.round(Number(payload.amountMinor ?? 0))

  return withTransaction(async () => {
    const sourceTx = await findTransactionRecordById(ledgerId, payload.txId)
    if (!sourceTx) {
      throw new Error('找不到來源交易')
    }

    await markTransactionReimbursed(ledgerId, payload.txId, true)

    if (!payload.accountId) {
      throw new Error('請選擇入帳帳戶')
    }

    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      throw new Error('報銷金額必須大於 0')
    }

    const existing = await findReimbursementSettlementIncomeTx(ledgerId, payload.txId)
    if (existing) {
      return { marked: true, createdIncome: true, alreadyExists: true, incomeTxId: existing.id }
    }

    const reimbursementCategoryId = await ensureHiddenReimbursementCategory(ledgerId)
    const occurredAt = payload.occurredAt ?? nowIso()
    const noteWithDate = appendDateToNote(payload.note, occurredAt)

    const incomeTxId = await addTransaction(ledgerId, {
      type: 'income',
      accountId: payload.accountId,
      categoryId: reimbursementCategoryId,
      amountMinor,
      occurredAt,
      note: noteWithDate,
      originType: 'reimbursement',
      externalRefId: payload.txId,
      includeInBudget: false,
      includeInAnalysis: false,
    })

    const copiedResult = await copyExpenseToTargetLedgers(ledgerId, sourceTx, payload)

    return {
      marked: true,
      createdIncome: true,
      incomeTxId,
      copiedLedgers: copiedResult.copied,
      skippedLedgers: copiedResult.skipped,
      requestedCopyLedgers: copiedResult.requested,
    }
  })
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

    return {
      unmarked: true,
      removedIncome: Boolean(incomeTx?.id),
      incomeTxId: incomeTx?.id ?? '',
    }
  })
}
