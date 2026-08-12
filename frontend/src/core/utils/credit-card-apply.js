/**
 * Credit-card P0 formal-path helpers (v1.1).
 * Shared by credit.service / transaction.service and sql.js regressions —
 * tests must call these (not hand-rolled INSERT simulations of product rules).
 */

import { derivePaidMinorFromAllocations } from './credit-period.js'

export function creditError(code, message) {
  const err = new Error(message || code)
  err.code = code
  return err
}

/**
 * Closed credit postings: default forbid edit/delete.
 * Only pure occurred_at correction is allowed (budget/calendar; does not reassign statement).
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
  if (mutatingKeys.length === 0) return true
  if (mutatingKeys.length === 1 && mutatingKeys[0] === 'occurredAt') return false
  return true
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
  return (Array.isArray(statements) ? statements : []).reduce((sum, st) => {
    const remaining = Math.round(Number(st?.remaining_minor ?? st?.remainingMinor ?? 0))
    return sum + (Number.isFinite(remaining) && remaining > 0 ? remaining : 0)
  }, 0)
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
