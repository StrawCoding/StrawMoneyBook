import { withTransaction } from '@/core/db/sqlite'
import {
  addTransaction,
  addTransfer,
  batchPatchCategoryForTransactions,
  countReimbursableTransactions,
  updateTransactionById,
  findTransactionById,
  findTransactionRecordById,
  listTransferTransactionsByGroup,
  listTransactionsByExternalRef,
  softDeleteTransactionById,
  softDeleteTransferGroup,
} from '@/core/repositories/transaction.repo'
import {
  buildBatchTransactionUpdateInput,
  hasBatchTransactionPatchChanges,
  normalizeBatchTransactionPatch,
} from '@/core/services/transaction-batch-patch'
import {
  archiveCategory,
  createCategory,
  createCategoryGroup,
  listCategories,
  listCategoryGroups,
  updateCategoryIcon,
} from '@/core/repositories/category.repo'
import { findAccountById } from '@/core/repositories/account.repo'
import { isSavingsJarAccount } from '@/core/repositories/savings-jar.repo'
import { assertCanCreateReimbursement } from '@/core/services/membership.service'
import { deleteLoanByExternalRefId } from '@/core/services/loan.service'
import {
  removeAdvanceUsagesForExpenseTransaction,
  removeReimbursementAdvanceEffectsBySourceTransaction,
} from '@/core/services/reimbursement.service'
import { reconcileDraftClaimSheetImportItems } from '@/core/services/claim-sheet-draft-sync.service'
import {
  applyCreateEditorAttribution,
  applyUpdateEditorAttribution,
  resolveCurrentTransactionEditor,
} from '@/core/services/transaction-editor-attribution'

const TRANSACTION_FAILURE_TRACE_MAX_ENTRIES = 60
const transactionFailureTraceListeners = new Set()
let transactionFailureTraceSeq = 0
let transactionFailureTraceEntries = []

function cloneTransactionFailureTraceEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  return {
    id: String(entry.id ?? ''),
    operation: String(entry.operation ?? ''),
    ledgerId: String(entry.ledgerId ?? ''),
    failedAt: String(entry.failedAt ?? ''),
    reasonType: String(entry.reasonType ?? ''),
    errorCode: String(entry.errorCode ?? ''),
    errorMessage: String(entry.errorMessage ?? ''),
  }
}

function trimTransactionFailureTraceEntries() {
  if (transactionFailureTraceEntries.length <= TRANSACTION_FAILURE_TRACE_MAX_ENTRIES) return
  transactionFailureTraceEntries = transactionFailureTraceEntries.slice(0, TRANSACTION_FAILURE_TRACE_MAX_ENTRIES)
}

function getTransactionFailureReasonType(error) {
  const message = String(error?.message ?? '')
  const lowered = message.toLowerCase()

  if (message.includes('免費版') || message.includes('會員')) return 'membership_limit'

  if (
    message.includes('必須') ||
    message.includes('需要') ||
    message.includes('請選擇') ||
    message.includes('不可') ||
    message.includes('不支援')
  ) {
    return 'validation'
  }

  if (
    lowered.includes('sqlite') ||
    lowered.includes('sql') ||
    lowered.includes('database') ||
    lowered.includes('constraint') ||
    lowered.includes('datatype mismatch') ||
    lowered.includes('no such') ||
    lowered.includes('code20') ||
    lowered.includes('code 20') ||
    lowered.includes('code 1')
  ) {
    return 'db_write'
  }

  return 'unknown'
}

function notifyTransactionFailureTraceListeners() {
  if (!transactionFailureTraceListeners.size) return
  const snapshot = getTransactionFailureTraceSnapshot()
  for (const listener of transactionFailureTraceListeners) {
    try {
      listener(snapshot)
    } catch (_error) {
      // Ignore listener errors.
    }
  }
}

function recordTransactionFailureTrace(operation, ledgerId, error) {
  const nowMs = Date.now()
  const entry = {
    id: `tx_fail_${nowMs}_${transactionFailureTraceSeq++}`,
    operation: String(operation ?? '').trim() || 'unknown',
    ledgerId: String(ledgerId ?? '').trim(),
    failedAt: new Date(nowMs).toISOString(),
    reasonType: getTransactionFailureReasonType(error),
    errorCode: String(error?.code ?? '').trim().toUpperCase(),
    errorMessage: String(error?.message ?? error ?? '').trim(),
  }
  transactionFailureTraceEntries = [entry, ...transactionFailureTraceEntries]
  trimTransactionFailureTraceEntries()
  notifyTransactionFailureTraceListeners()
}

async function ensureHiddenRefundCategory(ledgerId) {
  const categories = await listCategories(ledgerId, { includeArchived: true })
  const existing = categories.find((item) => item.name === '退款' && ['income', 'both'].includes(String(item.kind ?? '')))
  if (existing) {
    if (String(existing.icon ?? '').trim() !== 'fa-solid fa-money-bill-wave') {
      await updateCategoryIcon(ledgerId, existing.id, 'fa-solid fa-money-bill-wave')
    }
    if (!Number(existing.is_archived)) {
      await archiveCategory(ledgerId, existing.id)
    }
    return existing.id
  }

  const groups = await listCategoryGroups(ledgerId)
  let group = groups.find((item) => ['income', 'both'].includes(String(item.kind ?? '')) && !Number(item.is_archived))
  if (!group) {
    group = await createCategoryGroup(ledgerId, {
      name: '收入',
      kind: 'income',
      sortOrder: groups.length,
    })
  }

  const created = await createCategory(ledgerId, {
    groupId: group.id,
    name: '退款',
    kind: 'income',
    icon: 'fa-solid fa-money-bill-wave',
    isBudgetable: 0,
    sortOrder: categories.filter((item) => item.group_id === group.id).length,
  })
  await archiveCategory(ledgerId, created.id)
  return created.id
}

async function traceTransactionCreate(operation, ledgerId, task) {
  try {
    return await task()
  } catch (error) {
    recordTransactionFailureTrace(operation, ledgerId, error)
    throw error
  }
}

export function getTransactionFailureTraceSnapshot() {
  return transactionFailureTraceEntries
    .map(cloneTransactionFailureTraceEntry)
    .filter(Boolean)
}

export function subscribeTransactionFailureTrace(listener, { emitCurrent = true } = {}) {
  if (typeof listener !== 'function') {
    return () => {}
  }

  transactionFailureTraceListeners.add(listener)
  if (emitCurrent) {
    try {
      listener(getTransactionFailureTraceSnapshot())
    } catch (_error) {
      // Ignore listener errors.
    }
  }

  return () => {
    transactionFailureTraceListeners.delete(listener)
  }
}

function assertNonNegativeAmount(amountMinor) {
  const amount = Number(amountMinor)
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error('amountMinor 必須為大於或等於 0 的數字')
  }
}

function assertPositiveAmount(amountMinor) {
  const amount = Number(amountMinor)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('amountMinor 必須為大於 0 的數字')
  }
}

async function assertAccountAllowsDirectTransaction(ledgerId, accountId) {
  if (!accountId) return
  if (await isSavingsJarAccount(ledgerId, accountId)) {
    throw new Error('存錢罐僅支援存入與提取，請使用存錢罐功能頁')
  }
}

function isRefundLinkedTransaction(tx) {
  if (String(tx?.origin_type ?? '').trim() === 'refund') return true
  const categoryName = String(tx?.category_name ?? '').trim()
  const note = String(tx?.note ?? '').trim()
  if (!String(tx?.external_ref_id ?? '').trim()) return false
  return categoryName === '退款' || note.startsWith('退款：') || note.startsWith('退款:')
}

function normalizeCurrencyCode(value) {
  return String(value ?? '').trim().toUpperCase()
}

function shouldCascadeDeleteToParent(tx) {
  if (!tx || typeof tx !== 'object') return false
  return String(tx.origin_type ?? '').trim() === 'reimbursement'
}

function shouldCascadeLinkedTransaction(tx) {
  if (!tx || typeof tx !== 'object') return false
  return String(tx.origin_type ?? '').trim() === 'reimbursement' || isRefundLinkedTransaction(tx)
}

async function collectCascadeDeleteTransactionIds(ledgerId, target) {
  const visited = new Set()
  const pending = [String(target?.id ?? '').trim()].filter(Boolean)

  while (pending.length > 0) {
    const currentId = pending.shift()
    if (!currentId || visited.has(currentId)) continue

    const currentTx = currentId === target.id ? target : await findTransactionRecordById(ledgerId, currentId)
    if (!currentTx) continue

    visited.add(currentId)

    const parentId = String(currentTx.external_ref_id ?? '').trim()
    if (parentId && shouldCascadeDeleteToParent(currentTx) && !visited.has(parentId)) {
      pending.push(parentId)
    }

    const linkedTransactions = await listTransactionsByExternalRef(ledgerId, currentId)
    for (const linkedTx of linkedTransactions) {
      const linkedId = String(linkedTx?.id ?? '').trim()
      if (!linkedId || visited.has(linkedId)) continue
      if (!shouldCascadeLinkedTransaction(linkedTx)) continue
      pending.push(linkedId)
    }
  }

  return Array.from(visited)
}

export async function createExpense(ledgerId, payload) {
  return traceTransactionCreate('create_expense', ledgerId, async () => {
    assertNonNegativeAmount(payload.amountMinor)
    if (!payload.accountId || !payload.categoryId) {
      throw new Error('expense 需要 accountId 與 categoryId')
    }
    await assertAccountAllowsDirectTransaction(ledgerId, payload.accountId)

    const account = await findAccountById(ledgerId, payload.accountId)
    if (account && String(account.account_kind) === 'credit') {
      const { createCreditPurchase } = await import('@/core/services/credit.service')
      const result = await createCreditPurchase(ledgerId, {
        accountId: payload.accountId,
        categoryId: payload.categoryId,
        amountMinor: Math.abs(Number(payload.amountMinor)),
        occurredAt: payload.occurredAt ?? new Date().toISOString(),
        postedAt: payload.postedAt ?? payload.occurredAt ?? new Date().toISOString(),
        note: payload.note,
        includeInBudget: payload.includeInBudget !== false,
        includeInAnalysis: payload.includeInAnalysis !== false,
        idempotencyKey: payload.idempotencyKey ?? null,
      })
      return result.transactionId
    }

    if (Boolean(payload.isReimbursable)) {
      const reimbursableCount = await countReimbursableTransactions(ledgerId)
      assertCanCreateReimbursement(reimbursableCount)
    }

    return addTransaction(ledgerId, applyCreateEditorAttribution({
      ...payload,
      type: 'expense',
      amountMinor: Math.abs(Number(payload.amountMinor)) * -1,
      isReimbursable: Boolean(payload.isReimbursable),
      reimbursementState: payload.isReimbursable ? 'pending' : 'none',
      includeInBudget: payload.includeInBudget !== false,
      includeInAnalysis: payload.includeInAnalysis !== false,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
      postedAt: payload.postedAt ?? payload.occurredAt ?? new Date().toISOString(),
    }, await resolveCurrentTransactionEditor()))
  })
}

export async function createIncome(ledgerId, payload) {
  return traceTransactionCreate('create_income', ledgerId, async () => {
    assertNonNegativeAmount(payload.amountMinor)
    if (!payload.accountId || !payload.categoryId) {
      throw new Error('income 需要 accountId 與 categoryId')
    }
    await assertAccountAllowsDirectTransaction(ledgerId, payload.accountId)

    return addTransaction(ledgerId, applyCreateEditorAttribution({
      ...payload,
      type: 'income',
      amountMinor: Math.abs(Number(payload.amountMinor)),
      isReimbursable: false,
      reimbursementState: 'none',
      includeInBudget: payload.includeInBudget !== false,
      includeInAnalysis: payload.includeInAnalysis !== false,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
    }, await resolveCurrentTransactionEditor()))
  })
}

export async function createAdjustment(ledgerId, payload) {
  return traceTransactionCreate('create_adjustment', ledgerId, async () => {
    if (!payload.accountId) {
      throw new Error('adjustment 需要 accountId')
    }
    await assertAccountAllowsDirectTransaction(ledgerId, payload.accountId)
    if (!Number.isFinite(Number(payload.amountMinor)) || Number(payload.amountMinor) === 0) {
      throw new Error('adjustment amountMinor 不能為 0')
    }

    return addTransaction(ledgerId, applyCreateEditorAttribution({
      ...payload,
      type: 'adjustment',
      amountMinor: Number(payload.amountMinor),
      isReimbursable: false,
      reimbursementState: 'none',
      includeInBudget: payload.includeInBudget !== false,
      includeInAnalysis: payload.includeInAnalysis !== false,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
    }, await resolveCurrentTransactionEditor()))
  })
}

export async function createRefundAdjustment(ledgerId, payload = {}) {
  const sourceTransactionId = String(payload.sourceTransactionId ?? payload.externalRefId ?? '').trim()
  if (!sourceTransactionId) {
    throw new Error('缺少原始退款交易')
  }

  const sourceTx = await findTransactionRecordById(ledgerId, sourceTransactionId)
  if (!sourceTx) {
    throw new Error('找不到原始交易')
  }
  if (!['expense', 'income'].includes(String(sourceTx.type ?? ''))) {
    throw new Error('只有收入或支出可以建立退款')
  }
  if (sourceTx.transfer_group_id) {
    throw new Error('轉帳交易不可建立退款')
  }
  if (['reimbursement', 'loan_payment', 'refund'].includes(String(sourceTx.origin_type ?? '').trim())) {
    throw new Error('此交易不可建立退款')
  }

  const existingRefunds = await listTransactionsByExternalRef(ledgerId, sourceTransactionId)
  if (existingRefunds.some((item) => isRefundLinkedTransaction(item))) {
    throw new Error('此交易已建立退款')
  }

  const targetAccountId = String(payload.accountId ?? sourceTx.account_id ?? '').trim()
  if (!targetAccountId) {
    throw new Error('請選擇退款帳戶')
  }
  await assertAccountAllowsDirectTransaction(ledgerId, targetAccountId)

  const [sourceAccount, targetAccount] = await Promise.all([
    findAccountById(ledgerId, sourceTx.account_id),
    findAccountById(ledgerId, targetAccountId),
  ])
  if (!sourceAccount || !targetAccount) {
    throw new Error('找不到有效退款帳戶')
  }

  const sourceCurrency = normalizeCurrencyCode(sourceAccount.currency_code)
  const targetCurrency = normalizeCurrencyCode(targetAccount.currency_code)
  if (sourceCurrency && targetCurrency && sourceCurrency !== targetCurrency) {
    throw new Error('退款帳戶幣別必須與原交易帳戶一致')
  }

  const refundCategoryId = await ensureHiddenRefundCategory(ledgerId)
  const sourceAmountMinor = Math.round(Number(sourceTx.amount_minor ?? 0))
  if (!Number.isFinite(sourceAmountMinor) || sourceAmountMinor === 0) {
    throw new Error('原始交易金額無效')
  }
  const sourceAbsMinor = Math.abs(sourceAmountMinor)
  const requestedRefundMinor = payload.amountMinor == null
    ? sourceAbsMinor
    : Math.round(Math.abs(Number(payload.amountMinor)))
  if (!Number.isInteger(requestedRefundMinor) || requestedRefundMinor <= 0) {
    throw new Error('退款扣除金額必須大於 0')
  }
  if (requestedRefundMinor > sourceAbsMinor) {
    throw new Error('退款扣除金額不可超過原始交易金額')
  }

  // Formal credit refund: write adjustment posting into current OPEN statement.
  if (String(targetAccount.account_kind) === 'credit') {
    const { createCreditRefundAdjustment } = await import('@/core/services/credit.service')
    const result = await createCreditRefundAdjustment(ledgerId, {
      accountId: targetAccountId,
      amountMinor: requestedRefundMinor,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
      postedAt: payload.postedAt ?? payload.occurredAt ?? new Date().toISOString(),
      note: payload.note ?? null,
      externalRefId: sourceTransactionId,
      categoryId: refundCategoryId,
    })
    return result.transactionId
  }

  return createAdjustment(ledgerId, {
    ...payload,
    accountId: targetAccountId,
    amountMinor: sourceAmountMinor < 0 ? requestedRefundMinor : requestedRefundMinor * -1,
    categoryId: refundCategoryId,
    externalRefId: sourceTransactionId || null,
    originType: 'refund',
    includeInBudget: false,
    includeInAnalysis: false,
  })
}

export async function createTransfer(ledgerId, payload) {
  return traceTransactionCreate('create_transfer', ledgerId, async () => {
    assertPositiveAmount(payload.amountMinor)
    if (payload.toAmountMinor != null) {
      assertPositiveAmount(payload.toAmountMinor)
    }

    if (!payload.fromAccountId || !payload.toAccountId) {
      throw new Error('transfer 需要 fromAccountId 與 toAccountId')
    }

    if (payload.fromAccountId === payload.toAccountId) {
      throw new Error('轉出與轉入帳戶不可相同')
    }

    const sourceExtraMinorInput = Number(payload.sourceExtraMinor ?? 0)
    const sourceExtraMinor = Number.isFinite(sourceExtraMinorInput) ? Math.round(sourceExtraMinorInput) : 0
    if (Math.abs(Number(payload.amountMinor)) + sourceExtraMinor <= 0) {
      throw new Error('轉出金額（含附加項目）需大於 0')
    }
    const toAmountMinorInput = Number(payload.toAmountMinor ?? 0)
    const toAmountMinor = Number.isFinite(toAmountMinorInput) && toAmountMinorInput > 0
      ? Math.round(toAmountMinorInput)
      : null

    return addTransfer(ledgerId, applyCreateEditorAttribution({
      ...payload,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
      amountMinor: Number(payload.amountMinor),
      sourceExtraMinor,
      toAmountMinor,
    }, await resolveCurrentTransactionEditor()))
  })
}

export async function updateManualTransaction(ledgerId, txId, payload) {
  if (!txId) {
    throw new Error('缺少交易 ID')
  }
  const currentTx = await findTransactionById(ledgerId, txId)
  if (!currentTx) {
    throw new Error('找不到交易資料')
  }
  const currentPostedAt = String(currentTx.posted_at ?? currentTx.occurred_at ?? '').trim()
  const nextPostedAt = String(payload.postedAt ?? payload.occurredAt ?? '').trim()
  const changingPostedAt = Boolean(nextPostedAt) && nextPostedAt !== currentPostedAt
  const changingOccurredAt = Boolean(payload.occurredAt)
    && String(payload.occurredAt) !== String(currentTx.occurred_at)
    && !changingPostedAt
  const changingAmountOrAccount = (
    (payload.accountId != null && String(payload.accountId) !== String(currentTx.account_id))
    || (payload.amountMinor != null
      && Math.round(Number(payload.amountMinor)) !== Math.round(Number(currentTx.amount_minor)))
  )
  const changingCategory = payload.categoryId != null
    && String(payload.categoryId ?? '') !== String(currentTx.category_id ?? '')
  const changingNote = Object.prototype.hasOwnProperty.call(payload, 'note')
    && String(payload.note ?? '') !== String(currentTx.note ?? '')
  const changingFlags = (
    (payload.isReimbursable != null
      && Boolean(payload.isReimbursable) !== Boolean(Number(currentTx.is_reimbursable ?? 0)))
    || (payload.includeInBudget != null
      && Boolean(payload.includeInBudget) !== Boolean(Number(currentTx.include_in_budget ?? 1)))
    || (payload.includeInAnalysis != null
      && Boolean(payload.includeInAnalysis) !== Boolean(Number(currentTx.include_in_analysis ?? 1)))
  )
  try {
    const { assertTransactionMutableForCredit } = await import('@/core/services/credit.service')
    await assertTransactionMutableForCredit(ledgerId, txId, {
      changes: {
        amount: changingAmountOrAccount,
        account: changingAmountOrAccount,
        postedAt: changingPostedAt,
        category: changingCategory,
        note: changingNote,
        flags: changingFlags,
        occurredAt: changingOccurredAt,
        delete: false,
        batch: false,
      },
    })
  } catch (error) {
    if (error?.code === 'CLOSED_POSTING_MUTATION_FORBIDDEN') throw error
    // Non-credit txs: ignore
  }
  if (!payload.accountId) {
    throw new Error('請選擇帳戶')
  }
  if (payload.type !== 'transfer') {
    await assertAccountAllowsDirectTransaction(ledgerId, payload.accountId)
  }
  if (!payload.occurredAt) {
    throw new Error('請選擇交易時間')
  }
  const isRefundTransaction = String(currentTx.origin_type ?? '').trim() === 'refund'
  const editorPatch = applyUpdateEditorAttribution({}, await resolveCurrentTransactionEditor())

  if (payload.type === 'transfer') {
    const peerAccountId = String(payload.peerAccountId ?? '').trim()
    if (!peerAccountId) {
      throw new Error('請選擇轉入帳戶')
    }
    if (payload.accountId === peerAccountId) {
      throw new Error('轉出與轉入帳戶不可相同')
    }
    assertPositiveAmount(payload.amountMinor)
    if (!currentTx.transfer_group_id) {
      throw new Error('找不到轉帳群組')
    }

    const members = await listTransferTransactionsByGroup(ledgerId, currentTx.transfer_group_id)
    if (!Array.isArray(members) || members.length < 2) {
      throw new Error('轉帳資料不完整')
    }

    const normalizedAmountMinor = Math.abs(Math.round(Number(payload.amountMinor)))
    const sourceExtraMinorInput = Number(payload.sourceExtraMinor ?? 0)
    const sourceExtraMinor = Number.isFinite(sourceExtraMinorInput) ? Math.round(sourceExtraMinorInput) : 0
    if (normalizedAmountMinor + sourceExtraMinor <= 0) {
      throw new Error('轉出金額（含附加項目）需大於 0')
    }
    const commonUpdate = {
      categoryId: null,
      occurredAt: payload.occurredAt,
      note: payload.note ?? null,
      isReimbursable: false,
      reimbursementState: 'none',
      includeInBudget: payload.includeInBudget !== false,
      includeInAnalysis: payload.includeInAnalysis !== false,
      ...editorPatch,
    }

    const outTx = members.find((item) => Number(item.amount_minor ?? 0) < 0) ?? members[0]
    const inTx = members.find((item) => item.id !== outTx.id) ?? members[1]
    const toAmountMinorInput = Number(payload.toAmountMinor ?? 0)
    // Keep incoming leg synced with the primary transfer amount by default.
    // Addon delta only affects source(outgoing) leg.
    const toAmountMinor = Number.isFinite(toAmountMinorInput) && toAmountMinorInput > 0
      ? Math.round(toAmountMinorInput)
      : normalizedAmountMinor

    await updateTransactionById(ledgerId, outTx.id, {
      accountId: payload.accountId,
      peerAccountId,
      amountMinor: (normalizedAmountMinor + sourceExtraMinor) * -1,
      ...commonUpdate,
    })
    await updateTransactionById(ledgerId, inTx.id, {
      accountId: peerAccountId,
      peerAccountId: payload.accountId,
      amountMinor: toAmountMinor,
      ...commonUpdate,
    })
    return
  }

  let amountMinor = Number(payload.amountMinor)
  if (payload.type === 'expense' || payload.type === 'income') {
    if (isRefundTransaction) {
      throw new Error('退款紀錄不可改為收入或支出')
    }
    assertNonNegativeAmount(amountMinor)
    amountMinor = Math.abs(amountMinor)
    amountMinor = payload.type === 'expense' ? amountMinor * -1 : amountMinor
    if (!payload.categoryId) {
      throw new Error('請選擇分類')
    }
  } else if (payload.type === 'adjustment') {
    if (!Number.isFinite(amountMinor) || amountMinor === 0) {
      throw new Error('調整金額不可為 0')
    }
  } else {
    throw new Error('不支援的交易類型')
  }

  const isReimbursable = payload.type === 'expense' && Boolean(payload.isReimbursable)
  if (isReimbursable) {
    const reimbursableCount = await countReimbursableTransactions(ledgerId, { excludeTxId: txId })
    assertCanCreateReimbursement(reimbursableCount)
  }

  await updateTransactionById(ledgerId, txId, {
    accountId: payload.accountId,
    peerAccountId: null,
    categoryId: payload.type === 'adjustment' ? currentTx.category_id ?? null : payload.categoryId ?? null,
    amountMinor,
    occurredAt: payload.occurredAt,
    note: payload.note ?? null,
    isReimbursable,
    reimbursementState: isReimbursable ? 'pending' : 'none',
    includeInBudget: isRefundTransaction ? false : payload.includeInBudget !== false,
    includeInAnalysis: isRefundTransaction ? false : payload.includeInAnalysis !== false,
    ...editorPatch,
  })

  if (!isReimbursable && Boolean(Number(currentTx?.is_reimbursable ?? 0))) {
    await reconcileDraftClaimSheetImportItems(ledgerId, { txIds: [txId] })
  }
}

export async function deleteManualTransaction(ledgerId, txId) {
  if (!txId) {
    throw new Error('缺少交易 ID')
  }

  const target = await findTransactionRecordById(ledgerId, txId)
  if (!target) {
    throw new Error('找不到交易資料')
  }

  try {
    const { assertTransactionMutableForCredit } = await import('@/core/services/credit.service')
    await assertTransactionMutableForCredit(ledgerId, txId, {
      changes: { delete: true, amount: true, postedAt: true },
    })
  } catch (error) {
    if (error?.code === 'CLOSED_POSTING_MUTATION_FORBIDDEN') throw error
  }

  if (String(target.origin_type ?? '').trim() === 'loan_payment') {
    const externalRefId = String(target.external_ref_id ?? '').trim()
    const deletedLoan = externalRefId ? await deleteLoanByExternalRefId(ledgerId, externalRefId) : null
    if (deletedLoan) {
      return deletedLoan
    }
  }

  if (target.type === 'transfer' && target.transfer_group_id) {
    await softDeleteTransferGroup(ledgerId, target.transfer_group_id)
    return
  }

  const cascadeDeleteIds = await collectCascadeDeleteTransactionIds(ledgerId, target)
  await withTransaction(async () => {
    for (const relatedTxId of cascadeDeleteIds) {
      await removeAdvanceUsagesForExpenseTransaction(ledgerId, relatedTxId)
      await removeReimbursementAdvanceEffectsBySourceTransaction(ledgerId, relatedTxId)
      await softDeleteTransactionById(ledgerId, relatedTxId)
    }
    await reconcileDraftClaimSheetImportItems(ledgerId, { txIds: cascadeDeleteIds })
  })
}

export async function batchPatchCategory(ledgerId, txIds, categoryId) {
  const validIds = (txIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)
  if (!validIds.length) return 0
  // Hard reject: any closed credit posting in the selection fails the whole batch
  // (v1.1: closed 交易預設禁改；不得 silently skip then claim success).
  for (const txId of validIds) {
    try {
      const { assertTransactionMutableForCredit } = await import('@/core/services/credit.service')
      await assertTransactionMutableForCredit(ledgerId, txId, {
        changes: { category: true, batch: true },
      })
    } catch (error) {
      if (error?.code === 'CLOSED_POSTING_MUTATION_FORBIDDEN') throw error
    }
  }
  return batchPatchCategoryForTransactions(
    ledgerId,
    validIds,
    categoryId ?? null,
    await resolveCurrentTransactionEditor(),
  )
}

export async function batchPatchTransactions(ledgerId, txIds, rawPatch = {}) {
  const validIds = Array.from(new Set((txIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)))
  if (!validIds.length) return {
    updatedCount: 0,
    skippedCount: 0,
    skipped: [],
  }

  const patch = normalizeBatchTransactionPatch(rawPatch)
  if (!hasBatchTransactionPatchChanges(patch)) {
    throw new Error('請至少選擇一項要批量更新的欄位')
  }

  const skipped = []
  const targets = []

  // Pre-pass: any closed credit posting → hard-fail entire batch (no silent skip).
  for (const txId of validIds) {
    try {
      const { assertTransactionMutableForCredit } = await import('@/core/services/credit.service')
      await assertTransactionMutableForCredit(ledgerId, txId, {
        changes: {
          category: Boolean(patch.categoryId),
          note: patch.noteMode !== 'keep',
          flags: (
            patch.isReimbursableMode !== 'keep'
            || patch.includeInBudgetMode !== 'keep'
            || patch.includeInAnalysisMode !== 'keep'
          ),
          batch: true,
        },
      })
    } catch (error) {
      if (error?.code === 'CLOSED_POSTING_MUTATION_FORBIDDEN') throw error
    }
  }

  for (const txId of validIds) {
    const currentTx = await findTransactionRecordById(ledgerId, txId)
    if (!currentTx) {
      skipped.push({ txId, reason: '找不到交易資料' })
      continue
    }

    const plan = buildBatchTransactionUpdateInput(currentTx, patch)
    if (!plan.ok) {
      skipped.push({ txId, reason: plan.reason || '此交易不支援該批量變更' })
      continue
    }

    targets.push({
      txId,
      currentTx,
      input: plan.input,
    })
  }

  if (!targets.length) {
    throw new Error(skipped[0]?.reason || '沒有可更新的交易')
  }

  if (patch.isReimbursableMode === 'true') {
    const additionalReimbursableCount = targets.filter(({ currentTx, input }) => {
      return input.isReimbursable && !Boolean(Number(currentTx?.is_reimbursable ?? 0))
    }).length

    if (additionalReimbursableCount > 0) {
      const reimbursableCount = await countReimbursableTransactions(ledgerId)
      for (let index = 0; index < additionalReimbursableCount; index += 1) {
        assertCanCreateReimbursement(reimbursableCount + index)
      }
    }
  }

  const editor = await resolveCurrentTransactionEditor()
  for (const target of targets) {
    await updateTransactionById(
      ledgerId,
      target.txId,
      applyUpdateEditorAttribution(target.input, editor),
    )
  }

  const draftSyncTxIds = targets
    .filter(({ currentTx, input }) => {
      return Boolean(Number(currentTx?.is_reimbursable ?? 0)) && !input.isReimbursable
    })
    .map(({ txId }) => txId)
  if (draftSyncTxIds.length) {
    await reconcileDraftClaimSheetImportItems(ledgerId, { txIds: draftSyncTxIds })
  }

  return {
    updatedCount: targets.length,
    skippedCount: skipped.length,
    skipped,
  }
}
