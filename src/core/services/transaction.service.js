import {
  addTransaction,
  addTransfer,
  countReimbursableTransactions,
  findReimbursementSettlementIncomeTx,
  updateTransactionById,
  findTransactionById,
  listTransferTransactionsByGroup,
  softDeleteTransactionById,
  softDeleteTransferGroup,
  markTransactionReimbursed,
} from '@/core/repositories/transaction.repo'
import { assertCanCreateReimbursement } from '@/core/services/membership.service'

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

export async function createExpense(ledgerId, payload) {
  return traceTransactionCreate('create_expense', ledgerId, async () => {
    assertNonNegativeAmount(payload.amountMinor)
    if (!payload.accountId || !payload.categoryId) {
      throw new Error('expense 需要 accountId 與 categoryId')
    }

    if (Boolean(payload.isReimbursable)) {
      const reimbursableCount = await countReimbursableTransactions(ledgerId)
      assertCanCreateReimbursement(reimbursableCount)
    }

    return addTransaction(ledgerId, {
      ...payload,
      type: 'expense',
      amountMinor: Math.abs(Number(payload.amountMinor)) * -1,
      isReimbursable: Boolean(payload.isReimbursable),
      reimbursementState: payload.isReimbursable ? 'pending' : 'none',
      includeInBudget: payload.includeInBudget !== false,
      includeInAnalysis: payload.includeInAnalysis !== false,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
    })
  })
}

export async function createIncome(ledgerId, payload) {
  return traceTransactionCreate('create_income', ledgerId, async () => {
    assertNonNegativeAmount(payload.amountMinor)
    if (!payload.accountId || !payload.categoryId) {
      throw new Error('income 需要 accountId 與 categoryId')
    }

    return addTransaction(ledgerId, {
      ...payload,
      type: 'income',
      amountMinor: Math.abs(Number(payload.amountMinor)),
      isReimbursable: false,
      reimbursementState: 'none',
      includeInBudget: payload.includeInBudget !== false,
      includeInAnalysis: payload.includeInAnalysis !== false,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
    })
  })
}

export async function createAdjustment(ledgerId, payload) {
  return traceTransactionCreate('create_adjustment', ledgerId, async () => {
    if (!payload.accountId) {
      throw new Error('adjustment 需要 accountId')
    }
    if (!Number.isFinite(Number(payload.amountMinor)) || Number(payload.amountMinor) === 0) {
      throw new Error('adjustment amountMinor 不能為 0')
    }

    return addTransaction(ledgerId, {
      ...payload,
      type: 'adjustment',
      amountMinor: Number(payload.amountMinor),
      isReimbursable: false,
      reimbursementState: 'none',
      includeInBudget: payload.includeInBudget !== false,
      includeInAnalysis: payload.includeInAnalysis !== false,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
    })
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

    return addTransfer(ledgerId, {
      ...payload,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
      amountMinor: Number(payload.amountMinor),
      sourceExtraMinor,
      toAmountMinor,
    })
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
  if (!payload.accountId) {
    throw new Error('請選擇帳戶')
  }
  if (!payload.occurredAt) {
    throw new Error('請選擇交易時間')
  }

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
    }

    const outTx = members.find((item) => Number(item.amount_minor ?? 0) < 0) ?? members[0]
    const inTx = members.find((item) => item.id !== outTx.id) ?? members[1]
    const toAmountMinorInput = Number(payload.toAmountMinor ?? 0)
    const toAmountMinor = Number.isFinite(toAmountMinorInput) && toAmountMinorInput > 0
      ? Math.round(toAmountMinorInput)
      : Math.max(1, Math.abs(Math.round(Number(inTx?.amount_minor ?? normalizedAmountMinor))))

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
    categoryId: payload.type === 'adjustment' ? null : payload.categoryId ?? null,
    amountMinor,
    occurredAt: payload.occurredAt,
    note: payload.note ?? null,
    isReimbursable,
    reimbursementState: isReimbursable ? 'pending' : 'none',
    includeInBudget: payload.includeInBudget !== false,
    includeInAnalysis: payload.includeInAnalysis !== false,
  })
}

export async function deleteManualTransaction(ledgerId, txId) {
  if (!txId) {
    throw new Error('缺少交易 ID')
  }

  const target = await findTransactionById(ledgerId, txId)
  if (!target) {
    throw new Error('找不到交易資料')
  }

  if (target.type === 'transfer' && target.transfer_group_id) {
    await softDeleteTransferGroup(ledgerId, target.transfer_group_id)
    return
  }

  if (target.type === 'income' && target.origin_type === 'reimbursement' && target.external_ref_id) {
    await markTransactionReimbursed(ledgerId, String(target.external_ref_id), false)
  }

  if (target.type === 'expense') {
    const settlementIncome = await findReimbursementSettlementIncomeTx(ledgerId, txId)
    if (settlementIncome?.id) {
      await softDeleteTransactionById(ledgerId, settlementIncome.id)
    }
  }

  await softDeleteTransactionById(ledgerId, txId)
}
