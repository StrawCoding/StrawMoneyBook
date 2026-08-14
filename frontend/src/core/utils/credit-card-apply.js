/**
 * Credit-card P0 formal-path helpers (v1.1).
 * Shared by credit.service / transaction.service and sql.js regressions —
 * tests must call these (not hand-rolled INSERT simulations of product rules).
 */

import { getCreditCardDebtMinor } from '../domain/balance/balance-query.js'
import { derivePaidMinorFromAllocations } from './credit-period.js'

export function creditError(code, message) {
  const err = new Error(message || code)
  err.code = code
  return err
}

/**
 * Closed credit postings: default forbid edit/delete.
 * Only pure occurred_at correction is allowed (budget/calendar; does not reassign statement).
 * v1.1 HTML §5: 「改 occurred_at only → 允許；若改 posted_at → 拒絕」.
 */
export function shouldForbidClosedCreditMutation({
  status,
  changes = {},
} = {}) {
  if (String(status ?? '') !== 'closed') return false
  const flags = {
    amount: Boolean(changes.amount),
    account: Boolean(changes.account),
    postedAt: Boolean(changes.postedAt),
    category: Boolean(changes.category),
    note: Boolean(changes.note),
    flags: Boolean(changes.flags),
    delete: Boolean(changes.delete),
    batch: Boolean(changes.batch),
    occurredAt: Boolean(changes.occurredAt),
  }
  const mutatingKeys = Object.entries(flags)
    .filter(([, on]) => on)
    .map(([k]) => k)
  // Incomplete callers (empty flags) stay forbidden — safe default.
  if (mutatingKeys.length === 0) return true
  if (mutatingKeys.length === 1 && mutatingKeys[0] === 'occurredAt') return false
  return true
}

function hasOwn(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key)
}

/**
 * Diff payload vs existing transaction for closed-credit mutability checks.
 * Formal edit entry (updateManualTransaction) MUST use this — never infer
 * posted_at from occurredAt when payload omits postedAt (UI edit only sends occurredAt).
 */
export function diffCreditManualTransactionChanges(currentTx, payload = {}) {
  const current = currentTx && typeof currentTx === 'object' ? currentTx : {}
  const next = payload && typeof payload === 'object' ? payload : {}

  const currentAccountId = String(current.account_id ?? current.accountId ?? '').trim()
  const nextAccountId = next.accountId != null ? String(next.accountId).trim() : null
  const changingAccount = nextAccountId != null && nextAccountId !== currentAccountId

  const currentAmount = Math.round(Number(current.amount_minor ?? current.amountMinor ?? 0))
  const nextAmountRaw = next.amountMinor != null && next.amountMinor !== ''
    ? Math.round(Number(next.amountMinor))
    : null
  let changingAmount = false
  if (nextAmountRaw != null && Number.isFinite(nextAmountRaw)) {
    const txType = String(next.type ?? current.type ?? '').trim()
    if (txType === 'expense') {
      changingAmount = (-Math.abs(nextAmountRaw)) !== currentAmount
    } else if (txType === 'income') {
      changingAmount = Math.abs(nextAmountRaw) !== currentAmount
    } else {
      changingAmount = nextAmountRaw !== currentAmount
    }
  }

  // postedAt changes ONLY when explicitly provided — never fall back to occurredAt.
  const hasExplicitPostedAt = hasOwn(next, 'postedAt')
    && next.postedAt != null
    && String(next.postedAt).trim() !== ''
  const currentPostedAt = String(current.posted_at ?? current.postedAt ?? '').trim()
  const changingPostedAt = hasExplicitPostedAt
    && String(next.postedAt).trim() !== currentPostedAt

  const currentOccurredAt = String(current.occurred_at ?? current.occurredAt ?? '').trim()
  const nextOccurredAt = next.occurredAt != null ? String(next.occurredAt).trim() : ''
  const changingOccurredAt = Boolean(nextOccurredAt) && nextOccurredAt !== currentOccurredAt

  const changingCategory = next.categoryId != null
    && String(next.categoryId ?? '') !== String(current.category_id ?? current.categoryId ?? '')

  const changingNote = hasOwn(next, 'note')
    && String(next.note ?? '') !== String(current.note ?? '')

  const changingFlags = (
    (next.isReimbursable != null
      && Boolean(next.isReimbursable) !== Boolean(Number(current.is_reimbursable ?? 0)))
    || (next.includeInBudget != null
      && Boolean(next.includeInBudget) !== Boolean(Number(current.include_in_budget ?? 1)))
    || (next.includeInAnalysis != null
      && Boolean(next.includeInAnalysis) !== Boolean(Number(current.include_in_analysis ?? 1)))
  )

  return {
    amount: changingAmount,
    account: changingAccount,
    postedAt: changingPostedAt,
    category: changingCategory,
    note: changingNote,
    flags: changingFlags,
    occurredAt: changingOccurredAt,
    delete: false,
    batch: false,
  }
}

/** True when the edit touches any credit-relevant field (incl. pure occurred_at). */
export function isCreditRelevantManualMutation(changes = {}) {
  return Boolean(
    changes.amount
    || changes.account
    || changes.postedAt
    || changes.category
    || changes.note
    || changes.flags
    || changes.occurredAt
    || changes.delete
    || changes.batch,
  )
}

/**
 * Formal updateManualTransaction credit gate (v1.1).
 * Requires a FULL transaction row (findTransactionRecordById shape).
 * Slim findTransactionById rows mis-flag amount/account/postedAt and must fail closed.
 */
export function assertUpdateManualCreditMutationAllowed({
  currentTx,
  payload,
  status,
} = {}) {
  const changes = diffCreditManualTransactionChanges(currentTx, payload)
  const creditRelevant = isCreditRelevantManualMutation(changes)
  if (!creditRelevant) {
    return { changes, creditRelevant: false, allowed: true }
  }
  if (shouldForbidClosedCreditMutation({ status, changes })) {
    throw creditError('CLOSED_POSTING_MUTATION_FORBIDDEN', 'CLOSED_POSTING_MUTATION_FORBIDDEN')
  }
  return { changes, creditRelevant: true, allowed: true }
}

/**
 * Build updateTransactionById fields for the non-transfer branch of
 * updateManualTransaction. Never includes postedAt (statement assignment immutable).
 */
export function buildUpdateManualTransactionFields(currentTx, payload = {}) {
  const txType = String(payload.type ?? currentTx?.type ?? '').trim()
  const isRefund = String(currentTx?.origin_type ?? currentTx?.originType ?? '').trim() === 'refund'
  let amountMinor = Number(payload.amountMinor)
  if (txType === 'expense' || txType === 'income') {
    amountMinor = Math.abs(Math.round(amountMinor))
    amountMinor = txType === 'expense' ? amountMinor * -1 : amountMinor
  } else if (txType === 'adjustment') {
    amountMinor = Math.round(amountMinor)
  }
  const isReimbursable = txType === 'expense' && Boolean(payload.isReimbursable)
  return {
    accountId: payload.accountId,
    peerAccountId: null,
    categoryId: txType === 'adjustment'
      ? (currentTx?.category_id ?? currentTx?.categoryId ?? null)
      : (payload.categoryId ?? null),
    amountMinor,
    occurredAt: payload.occurredAt,
    // postedAt intentionally omitted — updateTransactionById must not rewrite posted_at
    note: payload.note ?? null,
    isReimbursable,
    reimbursementState: isReimbursable ? 'pending' : 'none',
    includeInBudget: isRefund ? false : payload.includeInBudget !== false,
    includeInAnalysis: isRefund ? false : payload.includeInAnalysis !== false,
  }
}

/**
 * Apply formal manual edit fields on sql.js (mirrors transaction.repo updateTransactionById).
 * Does NOT write posted_at — statement_id on postings stays unchanged.
 */
export function applyUpdateManualTransactionFields(db, {
  ledgerId,
  txId,
  fields,
  now,
} = {}) {
  const ts = now || new Date().toISOString()
  db.run(
    `UPDATE transactions
     SET account_id = ?,
         category_id = ?,
         amount_minor = ?,
         occurred_at = ?,
         note = ?,
         include_in_budget = ?,
         include_in_analysis = ?,
         updated_at = ?
     WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL;`,
    [
      fields.accountId,
      fields.categoryId ?? null,
      fields.amountMinor,
      fields.occurredAt,
      fields.note ?? null,
      fields.includeInBudget === false ? 0 : 1,
      fields.includeInAnalysis === false ? 0 : 1,
      ts,
      ledgerId,
      txId,
    ],
  )
  return { txId, postedAtUntouched: true }
}

/**
 * Validate repayment allocations against the same card + remaining.
 * statementsById: Map|object id → { account_id|accountId, remaining_minor|remainingMinor, status? }
 */
export function validateRepaymentAllocationPlan({
  accountId,
  amountMinor,
  allocations,
  statementsById,
} = {}) {
  const cardId = String(accountId ?? '').trim()
  const total = Math.round(Math.abs(Number(amountMinor)))
  if (!cardId) throw creditError('REPAYMENT_ACCOUNT_REQUIRED', '還款需要信用卡帳戶')
  if (!Number.isFinite(total) || total <= 0) {
    throw creditError('REPAYMENT_AMOUNT_INVALID', '還款金額必須大於 0')
  }
  const list = Array.isArray(allocations) ? allocations : []
  if (!list.length) {
    throw creditError('REPAYMENT_ALLOCATION_REQUIRED', '還款必須有 allocation')
  }

  const lookup = (id) => {
    if (!statementsById) return null
    if (typeof statementsById.get === 'function') return statementsById.get(id) ?? null
    return statementsById[id] ?? null
  }

  let sum = 0
  const normalized = []
  for (const raw of list) {
    const statementId = String(raw?.statementId ?? raw?.statement_id ?? '').trim()
    const allocAmount = Math.round(Math.abs(Number(raw?.amountMinor ?? raw?.amount_minor ?? 0)))
    if (!statementId || allocAmount <= 0) {
      throw creditError('REPAYMENT_ALLOCATION_REQUIRED', '還款必須有有效 allocation')
    }
    const st = lookup(statementId)
    if (!st) throw creditError('STATEMENT_NOT_FOUND', '找不到帳單')
    const stAccount = String(st.account_id ?? st.accountId ?? '').trim()
    if (stAccount !== cardId) {
      throw creditError('ALLOCATION_CROSS_CARD_FORBIDDEN', 'allocation 不可跨信用卡')
    }
    const remaining = Math.round(Number(st.remaining_minor ?? st.remainingMinor ?? 0))
    if (allocAmount > remaining) {
      throw creditError('ALLOCATION_EXCEEDS_REMAINING', 'allocation 不可超過帳單剩餘')
    }
    sum += allocAmount
    normalized.push({ statementId, amountMinor: allocAmount })
  }

  if (sum !== total) {
    throw creditError('ALLOCATION_SUM_MISMATCH', 'allocation 合計必須等於還款金額')
  }

  const paidDerived = derivePaidMinorFromAllocations(
    normalized.map((a) => ({ amount_minor: a.amountMinor })),
  )
  if (paidDerived !== total) {
    throw creditError('PAID_DERIVATION_MISMATCH', 'paid 必須等於 SUM(allocations)')
  }

  return { allocations: normalized, paidMinor: paidDerived }
}

/** Sum unpaid remaining across statements — actual card debt for limit alerts. */
export function computeActualCardDebtMinor(statements = []) {
  return getCreditCardDebtMinor(statements)
}

export function computeCreditUtilization({ debtMinor, creditLimitMinor } = {}) {
  const debt = Math.max(0, Math.round(Number(debtMinor) || 0))
  const limit = Math.max(0, Math.round(Number(creditLimitMinor) || 0))
  if (limit <= 0) {
    return { debtMinor: debt, creditLimitMinor: limit, utilization: null, nearLimit: false }
  }
  return {
    debtMinor: debt,
    creditLimitMinor: limit,
    utilization: Math.min(1, debt / limit),
    nearLimit: debt / limit >= 0.8,
  }
}

/**
 * Plan a formal credit refund/adjustment into the current OPEN statement.
 * Never mutates closed closing_balance_minor.
 */
export function clampPostedAtIntoOpenPeriod(postedAt, openStatement, nowIso) {
  const start = String(openStatement?.period_start_inclusive ?? '')
  const end = String(openStatement?.period_end_exclusive ?? '')
  const candidate = String(postedAt ?? nowIso ?? '')
  if (start && end && candidate >= start && candidate < end) return candidate
  const now = String(nowIso ?? '')
  if (start && end && now >= start && now < end) return now
  return start || candidate || now
}

/**
 * Plan a formal credit refund/adjustment into the current OPEN statement.
 * Never mutates closed closing_balance_minor.
 * Caller must pass the ledger's current OPEN statement (not a closed period).
 */
export function buildCreditRefundAdjustmentPlan({
  accountId,
  amountMinor,
  openStatementId,
  openStatementStatus = 'open',
  occurredAt,
  postedAt,
  note = '信用卡退款／調整',
  externalRefId = null,
  categoryId = null,
  transactionId = null,
  postingId = null,
} = {}) {
  const cardId = String(accountId ?? '').trim()
  const amount = Math.round(Math.abs(Number(amountMinor)))
  const statementId = String(openStatementId ?? '').trim()
  if (!cardId || amount <= 0) throw creditError('REFUND_PARAMS_INVALID', '退款參數無效')
  if (!statementId) throw creditError('OPEN_STATEMENT_REQUIRED', '需要當期 open statement')
  if (String(openStatementStatus) !== 'open') {
    throw creditError('CLOSED_STATEMENT_POSTING_FORBIDDEN', '退款只能寫入 open statement')
  }
  return {
    transaction: {
      id: transactionId,
      type: 'adjustment',
      accountId: cardId,
      categoryId: categoryId ?? null,
      amountMinor: amount, // liability decrease (positive on credit account)
      occurredAt,
      postedAt,
      note,
      originType: 'refund',
      externalRefId: externalRefId ?? null,
      includeInBudget: false,
      includeInAnalysis: false,
      tagsJson: JSON.stringify({ credit_adjustment: true }),
    },
    posting: {
      id: postingId,
      role: 'adjustment',
      accountId: cardId,
      categoryId: null,
      amountMinor: amount,
      statementId,
      includeInBudget: false,
      includeInAnalysis: false,
    },
    statementId,
  }
}

/**
 * Formal entry decision used by createRefundAdjustment:
 * credit accounts must use buildCreditRefundAdjustmentPlan → open posting;
 * non-credit keep legacy adjustment-only path (no statement posting).
 */
export function chooseRefundFormalPath(accountKind) {
  return String(accountKind ?? '') === 'credit' ? 'credit_open_posting' : 'legacy_adjustment'
}

/**
 * Apply refund plan on a sql.js-like db (formal path used by regressions).
 * Schema expects transactions + transaction_postings + credit_statements.
 */
export function applyCreditRefundAdjustmentPlan(db, ledgerId, plan, { now } = {}) {
  const ts = now || new Date().toISOString()
  const tx = plan.transaction
  const posting = plan.posting
  const txId = tx.id || `tx_refund_${Date.now()}`
  const postingId = posting.id || `post_refund_${Date.now()}`

  db.run(
    `INSERT INTO transactions (
      ledger_id, id, type, account_id, category_id, amount_minor, occurred_at, posted_at,
      note, origin_type, external_ref_id, include_in_budget, include_in_analysis,
      created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
    [
      ledgerId,
      txId,
      tx.type,
      tx.accountId,
      tx.categoryId,
      tx.amountMinor,
      tx.occurredAt || ts,
      tx.postedAt || ts,
      tx.note,
      tx.originType,
      tx.externalRefId,
      tx.includeInBudget ? 1 : 0,
      tx.includeInAnalysis ? 1 : 0,
      ts,
      ts,
    ],
  )
  db.run(
    `INSERT INTO transaction_postings (
      ledger_id, id, transaction_id, role, account_id, amount_minor, statement_id,
      created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
    [
      ledgerId,
      postingId,
      txId,
      posting.role,
      posting.accountId,
      posting.amountMinor,
      posting.statementId,
      ts,
      ts,
    ],
  )
  return { transactionId: txId, statementId: posting.statementId, postingId }
}

/**
 * Formal close: write closing_balance once; second call with same token is no-op.
 */
export function applyCreditStatementClose(db, {
  ledgerId,
  statementId,
  closingBalanceMinor,
  dueOn,
  closeToken,
  now,
}) {
  const rows = db.exec(
    `SELECT status, close_token, closing_balance_minor FROM credit_statements
     WHERE ledger_id='${ledgerId}' AND id='${statementId}';`,
  )
  const row = rows[0]?.values?.[0]
  if (!row) throw creditError('STATEMENT_NOT_FOUND', '找不到帳單')
  if (row[0] === 'closed') {
    return { noop: true, closing: Math.round(Number(row[2] ?? 0)), status: 'closed' }
  }
  const ts = now || new Date().toISOString()
  db.run(
    `UPDATE credit_statements SET status='closed', closing_balance_minor=?, due_on=?,
      closed_at=?, close_token=?, updated_at=?
     WHERE ledger_id=? AND id=? AND status='open';`,
    [closingBalanceMinor, dueOn, ts, closeToken, ts, ledgerId, statementId],
  )
  return { noop: false, closing: Math.round(Number(closingBalanceMinor)), status: 'closed' }
}

/**
 * Formal repayment allocation insert after validateRepaymentAllocationPlan.
 */
export function applyCreditRepaymentAllocationPlan(db, ledgerId, {
  repaymentId,
  accountId,
  sourceAccountId,
  amountMinor,
  paidAt,
  idempotencyKey,
  allocations,
  now,
}) {
  const ts = now || paidAt || new Date().toISOString()
  db.run(
    `INSERT INTO credit_repayments (
      ledger_id, id, account_id, source_account_id, amount_minor, paid_at, idempotency_key,
      created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
    [ledgerId, repaymentId, accountId, sourceAccountId, amountMinor, paidAt || ts, idempotencyKey, ts, ts],
  )
  allocations.forEach((alloc, index) => {
    db.run(
      `INSERT INTO credit_repayment_allocations (
        ledger_id, id, repayment_id, statement_id, amount_minor, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL);`,
      [ledgerId, `${repaymentId}_a${index}`, repaymentId, alloc.statementId, alloc.amountMinor, ts, ts],
    )
  })
  return { repaymentId, paidMinor: derivePaidMinorFromAllocations(allocations.map((a) => ({ amount_minor: a.amountMinor }))) }
}
