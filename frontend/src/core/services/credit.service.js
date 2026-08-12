import { createId } from '@/core/utils/id'
import { assertLedgerId } from '@/core/repositories/base.repo'
import { findAccountById, updateAccountProfile, listAccounts } from '@/core/repositories/account.repo'
import { addTransaction, addTransfer } from '@/core/repositories/transaction.repo'
import { getSetting, setSetting } from '@/core/repositories/settings.repo'
import { withTransaction } from '@/core/db/sqlite'
import {
  computeDueOn,
  derivePaidMinorFromAllocations,
  isOverdue,
  normalizeCloseDay,
  normalizeDueDay,
  parseLocalIso,
  resolvePeriodBoundsForPostedAt,
  shouldNotifyRepaymentReminder,
  toLocalIso,
} from '@/core/utils/credit-period'
import {
  buildCreditRefundAdjustmentPlan,
  computeActualCardDebtMinor,
  computeCreditUtilization,
  shouldForbidClosedCreditMutation,
  validateRepaymentAllocationPlan,
} from '@/core/utils/credit-card-apply'
import {
  closeCreditStatementRow,
  findCreditStatementById,
  findOpenCreditStatement,
  findPostingStatementStatus,
  findRepaymentByIdempotency,
  findStatementForPostedAt,
  insertCreditAllocation,
  insertCreditRepayment,
  insertCreditStatement,
  insertTransactionPosting,
  listAllocationsForRepayment,
  listAllocationsForStatement,
  listCreditAccounts,
  listCreditStatements,
  listPostingsForTransaction,
  listUnpaidStatementsFifo,
  sumAllocationsForStatement,
  sumCardLiabilityForStatement,
} from '@/core/repositories/credit.repo'

export const CREDIT_HOME_CARD_SETTING_KEY = 'credit.home_card_enabled'
export const FORBIDDEN_ACCRUAL_ACCOUNT_NAME = 'credit-accrual'

function sha1Lite(text) {
  // Lightweight non-crypto hash for closing_hash audit (stable string).
  let h = 2166136261
  const s = String(text ?? '')
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a_${(h >>> 0).toString(16)}`
}

function normalizePostedAt(value, occurredAt) {
  const raw = String(value ?? occurredAt ?? '').trim()
  if (!raw) return toLocalIso(new Date())
  // Accept Date / ISO; normalize to local-ish ISO via parse
  try {
    return toLocalIso(parseLocalIso(raw))
  } catch {
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) throw new Error('posted_at 無效')
    return d.toISOString()
  }
}

export async function isCreditHomeCardEnabled(ledgerId) {
  const raw = await getSetting(ledgerId, CREDIT_HOME_CARD_SETTING_KEY)
  if (raw === true || raw === 1 || raw === '1' || raw === 'true') return true
  if (raw && typeof raw === 'object' && raw.enabled === true) return true
  return false
}

export async function setCreditHomeCardEnabled(ledgerId, enabled) {
  await setSetting(ledgerId, CREDIT_HOME_CARD_SETTING_KEY, { enabled: Boolean(enabled) })
}

export async function assertNoVirtualAccrualAccounts(ledgerId) {
  assertLedgerId(ledgerId)
  const accounts = await listAccounts(ledgerId)
  const bad = (Array.isArray(accounts) ? accounts : []).filter((a) => {
    const name = String(a?.name ?? '').trim().toLowerCase()
    return name.includes(FORBIDDEN_ACCRUAL_ACCOUNT_NAME) || name.includes('信用卡應計')
  })
  if (bad.length) {
    throw new Error('禁止建立信用卡應計中介帳戶')
  }
  return true
}

export function profileDefaultsFromAccount(account) {
  const reminder = Number(account?.repayment_reminder_day)
  const closeDay = normalizeCloseDay(
    account?.statement_close_day ?? (Number.isInteger(reminder) ? reminder : 25),
    25,
  )
  const dueDay = normalizeDueDay(
    account?.payment_due_day ?? (Number.isInteger(reminder) ? reminder : 15),
    15,
  )
  return { statementCloseDay: closeDay, paymentDueDay: dueDay }
}

export async function ensureCreditProfileDefaults(ledgerId, accountId) {
  const account = await findAccountById(ledgerId, accountId)
  if (!account || String(account.account_kind) !== 'credit') {
    throw new Error('不是信用卡帳戶')
  }
  const defaults = profileDefaultsFromAccount(account)
  const needClose = account.statement_close_day == null
  const needDue = account.payment_due_day == null
  if (needClose || needDue) {
    await updateAccountProfile(ledgerId, accountId, {
      name: account.name,
      groupId: account.group_id,
      icon: account.icon,
      accountKind: 'credit',
      statementCloseDay: needClose ? defaults.statementCloseDay : account.statement_close_day,
      paymentDueDay: needDue ? defaults.paymentDueDay : account.payment_due_day,
      creditLimitMinor: account.credit_limit_minor,
      repaymentReminderDay: account.repayment_reminder_day,
      openingBalanceMinor: account.opening_balance_minor,
      currencyCode: account.currency_code,
      includeInAssets: account.include_in_assets,
      includeInGroupStatistics: account.include_in_group_statistics,
    })
  }
  return { ...account, ...defaults, statement_close_day: needClose ? defaults.statementCloseDay : account.statement_close_day, payment_due_day: needDue ? defaults.paymentDueDay : account.payment_due_day }
}

async function ensureOpenStatementForAccount(ledgerId, account, now = new Date()) {
  const existing = await findOpenCreditStatement(ledgerId, account.id)
  if (existing) return existing
  const { statementCloseDay, paymentDueDay } = profileDefaultsFromAccount(account)
  const bounds = resolvePeriodBoundsForPostedAt(now, statementCloseDay)
  try {
    const id = await insertCreditStatement(ledgerId, {
      accountId: account.id,
      periodStartInclusive: bounds.periodStartInclusive,
      periodEndExclusive: bounds.periodEndExclusive,
      status: 'open',
    })
    return findCreditStatementById(ledgerId, id)
  } catch (error) {
    const again = await findOpenCreditStatement(ledgerId, account.id)
    if (again) return again
    throw error
  }
}

/**
 * Close open statement when now >= period_end_exclusive; open next. Idempotent.
 */
export async function rolloverCreditCardIfDue(ledgerId, accountId, { now = new Date() } = {}) {
  assertLedgerId(ledgerId)
  let account = await findAccountById(ledgerId, accountId)
  if (!account || String(account.account_kind) !== 'credit') return { closed: false, reason: 'not_credit' }
  account = await ensureCreditProfileDefaults(ledgerId, accountId)

  const open = await ensureOpenStatementForAccount(ledgerId, account, now)
  const endMs = parseLocalIso(open.period_end_exclusive).getTime()
  const nowMs = (now instanceof Date ? now : parseLocalIso(now)).getTime()
  if (nowMs < endMs) {
    return { closed: false, statement: open, reason: 'not_due' }
  }

  const closeToken = `close:${open.id}:${open.period_end_exclusive}`
  if (open.close_token === closeToken && open.status === 'closed') {
    return { closed: false, reason: 'already_closed', statement: open }
  }

  return withTransaction(async () => {
    const fresh = await findCreditStatementById(ledgerId, open.id)
    if (!fresh || fresh.status !== 'open') {
      return { closed: false, reason: 'already_closed', statement: fresh }
    }
    if (fresh.close_token === closeToken) {
      return { closed: false, reason: 'idempotent', statement: fresh }
    }

    const liability = await sumCardLiabilityForStatement(ledgerId, fresh.id)
    const paid = await sumAllocationsForStatement(ledgerId, fresh.id)
    const closingBalanceMinor = Math.max(0, liability - paid)
    const { paymentDueDay, statementCloseDay } = profileDefaultsFromAccount(account)
    const closeDayYmd = String(fresh.period_end_exclusive).slice(0, 10)
    // close day is day before period_end_exclusive
    const endExclusive = parseLocalIso(fresh.period_end_exclusive)
    const closeCal = new Date(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate() - 1)
    const dueOn = computeDueOn(toLocalIso(closeCal).slice(0, 10), paymentDueDay)
    const closingHash = sha1Lite(`${fresh.id}|${closingBalanceMinor}|${fresh.period_start_inclusive}|${fresh.period_end_exclusive}`)

    await closeCreditStatementRow(ledgerId, fresh.id, {
      closingBalanceMinor,
      dueOn,
      closedAt: toLocalIso(now instanceof Date ? now : parseLocalIso(now)),
      closingHash,
      closeToken,
    })

    const nextBounds = resolvePeriodBoundsForPostedAt(fresh.period_end_exclusive, statementCloseDay)
    // Next period starts at previous end exclusive
    let nextId = null
    try {
      nextId = await insertCreditStatement(ledgerId, {
        accountId: account.id,
        periodStartInclusive: fresh.period_end_exclusive,
        periodEndExclusive: nextBounds.periodEndExclusive,
        status: 'open',
      })
    } catch (error) {
      const existingOpen = await findOpenCreditStatement(ledgerId, account.id)
      if (!existingOpen) throw error
      nextId = existingOpen.id
    }

    const closed = await findCreditStatementById(ledgerId, fresh.id)
    const next = await findCreditStatementById(ledgerId, nextId)
    return { closed: true, statement: closed, nextStatement: next }
  })
}

export async function runCreditStatementRollovers(ledgerId, { now = new Date() } = {}) {
  assertLedgerId(ledgerId)
  await assertNoVirtualAccrualAccounts(ledgerId)
  const accounts = await listCreditAccounts(ledgerId)
  const results = []
  for (const account of accounts) {
    // Loop until current open period covers now (handles multi-month gaps)
    let guard = 0
    let last = null
    while (guard < 36) {
      last = await rolloverCreditCardIfDue(ledgerId, account.id, { now })
      results.push({ accountId: account.id, ...last })
      if (!last.closed) break
      guard += 1
    }
  }
  return results
}

export async function assignStatementForPostedAt(ledgerId, accountId, postedAt) {
  const account = await ensureCreditProfileDefaults(ledgerId, accountId)
  await runCreditStatementRollovers(ledgerId, { now: parseLocalIso(postedAt) })
  // Also rollover against wall clock so open exists for "today"
  await runCreditStatementRollovers(ledgerId)
  let statement = await findStatementForPostedAt(ledgerId, accountId, postedAt)
  if (!statement) {
    const bounds = resolvePeriodBoundsForPostedAt(postedAt, profileDefaultsFromAccount(account).statementCloseDay)
    try {
      const id = await insertCreditStatement(ledgerId, {
        accountId,
        periodStartInclusive: bounds.periodStartInclusive,
        periodEndExclusive: bounds.periodEndExclusive,
        status: 'open',
      })
      statement = await findCreditStatementById(ledgerId, id)
    } catch {
      statement = await findStatementForPostedAt(ledgerId, accountId, postedAt)
        || await findOpenCreditStatement(ledgerId, accountId)
    }
  }
  if (!statement) throw new Error('無法指派帳單期')
  if (statement.status === 'closed') {
    const err = new Error('CLOSED_STATEMENT_POSTING_FORBIDDEN')
    err.code = 'CLOSED_STATEMENT_POSTING_FORBIDDEN'
    throw err
  }
  return statement
}

/**
 * Dual-leg credit purchase: transaction (visible) + postings (expense_accrual + card_liability).
 * No virtual intermediary account.
 */
export async function createCreditPurchase(ledgerId, payload = {}) {
  assertLedgerId(ledgerId)
  const accountId = String(payload.accountId ?? '').trim()
  const categoryId = String(payload.categoryId ?? '').trim()
  const amountMinor = Math.round(Math.abs(Number(payload.amountMinor)))
  if (!accountId || !categoryId) throw new Error('刷卡需要帳戶與分類')
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) throw new Error('金額必須大於 0')

  const account = await findAccountById(ledgerId, accountId)
  if (!account || String(account.account_kind) !== 'credit') {
    throw new Error('請選擇信用卡帳戶')
  }
  await assertNoVirtualAccrualAccounts(ledgerId)

  const occurredAt = normalizePostedAt(payload.occurredAt, payload.occurredAt)
  const postedAt = normalizePostedAt(payload.postedAt, occurredAt)
  const idempotencyKey = String(payload.idempotencyKey ?? '').trim() || null

  if (idempotencyKey) {
    const { query } = await import('@/core/db/sqlite')
    const existing = await query(
      `SELECT id FROM transactions
       WHERE ledger_id = ? AND idempotency_key = ? AND deleted_at IS NULL LIMIT 1;`,
      [ledgerId, idempotencyKey],
    )
    const row = Array.isArray(existing) ? existing[0] : existing?.values?.[0]
    if (row?.id) {
      return { transactionId: row.id, noop: true }
    }
  }

  return withTransaction(async () => {
    const statement = await assignStatementForPostedAt(ledgerId, accountId, postedAt)
    const liability = -amountMinor

    const txId = await addTransaction(ledgerId, {
      type: 'expense',
      accountId,
      categoryId,
      amountMinor: liability,
      occurredAt,
      postedAt,
      note: payload.note ?? null,
      originType: 'manual',
      idempotencyKey,
      includeInBudget: payload.includeInBudget !== false,
      includeInAnalysis: payload.includeInAnalysis !== false,
      tagsJson: JSON.stringify({ credit_purchase: true }),
    })

    await insertTransactionPosting(ledgerId, {
      transactionId: txId,
      role: 'expense_accrual',
      accountId: null,
      categoryId,
      amountMinor: liability,
      statementId: null,
      includeInBudget: payload.includeInBudget !== false,
      includeInAnalysis: payload.includeInAnalysis !== false,
    })
    await insertTransactionPosting(ledgerId, {
      transactionId: txId,
      role: 'card_liability',
      accountId,
      categoryId: null,
      amountMinor: liability,
      statementId: statement.id,
      includeInBudget: false,
      includeInAnalysis: false,
    })

    return { transactionId: txId, statementId: statement.id, noop: false }
  })
}

/**
 * Create repayment with mandatory allocations. paid = SUM(alloc) only.
 */
export async function createCreditRepayment(ledgerId, payload = {}) {
  assertLedgerId(ledgerId)
  const accountId = String(payload.accountId ?? '').trim()
  const sourceAccountId = String(payload.sourceAccountId ?? '').trim()
  const amountMinor = Math.round(Math.abs(Number(payload.amountMinor)))
  const paidAt = normalizePostedAt(payload.paidAt, new Date().toISOString())
  const idempotencyKey = String(payload.idempotencyKey ?? '').trim() || `repay:${createId('key')}`

  if (!accountId || !sourceAccountId) throw new Error('還款需要信用卡與來源帳戶')
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) throw new Error('還款金額必須大於 0')
  if (accountId === sourceAccountId) throw new Error('來源帳戶不可為同一張卡')

  const existing = await findRepaymentByIdempotency(ledgerId, idempotencyKey)
  if (existing) {
    const allocs = await listAllocationsForRepayment(ledgerId, existing.id)
    return { repaymentId: existing.id, noop: true, allocations: allocs }
  }

  let allocations = Array.isArray(payload.allocations) ? payload.allocations : null
  const unpaid = await listUnpaidStatementsFifo(ledgerId, accountId)
  if (!allocations || allocations.length === 0) {
    if (payload.mode === 'full' || payload.mode === 'custom' || !payload.mode) {
      // Auto FIFO allocation
      let left = amountMinor
      allocations = []
      for (const st of unpaid) {
        if (left <= 0) break
        const take = Math.min(left, st.remaining_minor)
        if (take > 0) {
          allocations.push({ statementId: st.id, amountMinor: take })
          left -= take
        }
      }
      if (payload.statementId && payload.mode === 'full') {
        const target = unpaid.find((s) => s.id === payload.statementId)
        if (target) {
          allocations = [{ statementId: target.id, amountMinor: Math.min(amountMinor, target.remaining_minor) }]
        }
      }
    }
  }

  const statementsById = {}
  for (const st of unpaid) {
    statementsById[st.id] = st
  }
  // Also resolve any explicitly referenced statements (custom mode) for remaining checks
  for (const alloc of allocations || []) {
    const sid = String(alloc?.statementId ?? alloc?.statement_id ?? '').trim()
    if (!sid || statementsById[sid]) continue
    const st = await findCreditStatementById(ledgerId, sid)
    if (!st) continue
    const paid = await sumAllocationsForStatement(ledgerId, st.id)
    const liability = st.status === 'closed'
      ? Math.round(Number(st.closing_balance_minor ?? 0))
      : await sumCardLiabilityForStatement(ledgerId, st.id)
    statementsById[sid] = {
      ...st,
      remaining_minor: Math.max(0, liability - paid),
    }
  }

  const validated = validateRepaymentAllocationPlan({
    accountId,
    amountMinor,
    allocations,
    statementsById,
  })
  allocations = validated.allocations

  return withTransaction(async () => {
    await runCreditStatementRollovers(ledgerId, { now: parseLocalIso(paidAt) })

    // Re-validate remaining inside the transaction against latest rows
    const freshById = {}
    for (const alloc of allocations) {
      const st = await findCreditStatementById(ledgerId, alloc.statementId)
      if (!st) throw new Error('找不到帳單')
      const paid = await sumAllocationsForStatement(ledgerId, st.id)
      const liability = st.status === 'closed'
        ? Math.round(Number(st.closing_balance_minor ?? 0))
        : await sumCardLiabilityForStatement(ledgerId, st.id)
      freshById[st.id] = {
        ...st,
        remaining_minor: Math.max(0, liability - paid),
      }
    }
    validateRepaymentAllocationPlan({
      accountId,
      amountMinor,
      allocations,
      statementsById: freshById,
    })

    const transfer = await addTransfer(ledgerId, {
      fromAccountId: sourceAccountId,
      toAccountId: accountId,
      amountMinor,
      occurredAt: paidAt,
      note: payload.note ?? '信用卡還款',
      includeInBudget: false,
      includeInAnalysis: false,
    })
    const groupId = transfer?.transferGroupId ?? null

    const repaymentId = await insertCreditRepayment(ledgerId, {
      accountId,
      sourceAccountId,
      amountMinor,
      paidAt,
      transferGroupId: groupId,
      idempotencyKey,
      note: payload.note ?? null,
    })

    for (const alloc of allocations) {
      await insertCreditAllocation(ledgerId, {
        repaymentId,
        statementId: alloc.statementId,
        amountMinor: alloc.amountMinor,
      })
    }

    const saved = await listAllocationsForRepayment(ledgerId, repaymentId)
    const paidDerived = derivePaidMinorFromAllocations(saved)
    if (paidDerived !== amountMinor) {
      throw new Error('paid 必須等於 SUM(allocations)')
    }

    return { repaymentId, transferGroupId: groupId, allocations: saved, noop: false }
  })
}

export async function assertTransactionMutableForCredit(ledgerId, transactionId, {
  changes = {},
} = {}) {
  const statusRow = await findPostingStatementStatus(ledgerId, transactionId)
  if (!statusRow) return true
  if (shouldForbidClosedCreditMutation({ status: statusRow.status, changes })) {
    const err = new Error('CLOSED_POSTING_MUTATION_FORBIDDEN')
    err.code = 'CLOSED_POSTING_MUTATION_FORBIDDEN'
    err.statementId = statusRow.statement_id
    throw err
  }
  return true
}

export async function createCreditRefundAdjustment(ledgerId, payload = {}) {
  // Formal refund path: write adjustment posting into current OPEN statement;
  // never mutate closed closing_balance_minor.
  const accountId = String(payload.accountId ?? '').trim()
  const amountMinor = Math.round(Math.abs(Number(payload.amountMinor)))
  const occurredAt = normalizePostedAt(payload.occurredAt, new Date().toISOString())
  const postedAt = normalizePostedAt(payload.postedAt, occurredAt)
  if (!accountId || amountMinor <= 0) throw new Error('退款參數無效')

  const account = await findAccountById(ledgerId, accountId)
  if (!account || String(account.account_kind) !== 'credit') {
    throw new Error('請選擇信用卡帳戶')
  }

  return withTransaction(async () => {
    const statement = await assignStatementForPostedAt(ledgerId, accountId, postedAt)
    const plan = buildCreditRefundAdjustmentPlan({
      accountId,
      amountMinor,
      openStatementId: statement.id,
      openStatementStatus: statement.status,
      occurredAt,
      postedAt,
      note: payload.note ?? '信用卡退款／調整',
      externalRefId: payload.externalRefId ?? payload.sourceTransactionId ?? null,
      categoryId: payload.categoryId ?? null,
    })
    const txId = await addTransaction(ledgerId, {
      type: plan.transaction.type,
      accountId: plan.transaction.accountId,
      categoryId: plan.transaction.categoryId,
      amountMinor: plan.transaction.amountMinor,
      occurredAt: plan.transaction.occurredAt,
      postedAt: plan.transaction.postedAt,
      note: plan.transaction.note,
      originType: plan.transaction.originType,
      externalRefId: plan.transaction.externalRefId,
      includeInBudget: plan.transaction.includeInBudget,
      includeInAnalysis: plan.transaction.includeInAnalysis,
      tagsJson: plan.transaction.tagsJson,
    })
    await insertTransactionPosting(ledgerId, {
      transactionId: txId,
      role: plan.posting.role,
      accountId: plan.posting.accountId,
      categoryId: plan.posting.categoryId,
      amountMinor: plan.posting.amountMinor,
      statementId: plan.posting.statementId,
      includeInBudget: plan.posting.includeInBudget,
      includeInAnalysis: plan.posting.includeInAnalysis,
    })
    return { transactionId: txId, statementId: plan.statementId }
  })
}

export async function loadCreditCardDashboard(ledgerId) {
  assertLedgerId(ledgerId)
  await runCreditStatementRollovers(ledgerId)
  const accounts = await listCreditAccounts(ledgerId)
  const cards = []
  const reminders = []

  for (const account of accounts) {
    const open = await findOpenCreditStatement(ledgerId, account.id)
    const statements = await listCreditStatements(ledgerId, account.id, { limit: 6 })
    const enriched = []
    for (const st of statements) {
      const paid = await sumAllocationsForStatement(ledgerId, st.id)
      const liability = st.status === 'closed'
        ? Math.round(Number(st.closing_balance_minor ?? 0))
        : await sumCardLiabilityForStatement(ledgerId, st.id)
      const remaining = Math.max(0, liability - paid)
      const row = {
        ...st,
        paid_minor: paid,
        remaining_minor: remaining,
        overdue: st.status === 'closed' && isOverdue({ dueOn: st.due_on, remainingMinor: remaining }),
      }
      enriched.push(row)
      if (row.overdue || shouldNotifyRepaymentReminder({
        dueOn: st.due_on,
        repaymentReminderDay: account.repayment_reminder_day,
        remainingMinor: remaining,
      })) {
        reminders.push({
          accountId: account.id,
          accountName: account.name,
          statementId: st.id,
          dueOn: st.due_on,
          remainingMinor: remaining,
          overdue: row.overdue,
          // overdue NEVER uses reminder day
        })
      }
    }

    // Actual card debt = SUM(statement remaining), not raw account.balance_minor.
    const unpaid = await listUnpaidStatementsFifo(ledgerId, account.id)
    const debtMinor = computeActualCardDebtMinor(unpaid)
    const limit = Math.max(0, Number(account.credit_limit_minor ?? 0))
    const util = computeCreditUtilization({ debtMinor, creditLimitMinor: limit })
    const openLiability = open ? await sumCardLiabilityForStatement(ledgerId, open.id) : 0
    const openPaid = open ? await sumAllocationsForStatement(ledgerId, open.id) : 0

    cards.push({
      account,
      openStatement: open,
      statements: enriched,
      openRemainingMinor: Math.max(0, openLiability - openPaid),
      debtMinor: util.debtMinor,
      creditLimitMinor: util.creditLimitMinor,
      utilization: util.utilization,
      nearLimit: util.nearLimit,
    })
  }

  return { cards, reminders }
}

export async function getStatementPaidMinor(ledgerId, statementId) {
  const allocs = await listAllocationsForStatement(ledgerId, statementId)
  return derivePaidMinorFromAllocations(allocs)
}

export {
  listCreditAccounts,
  listCreditStatements,
  listPostingsForTransaction,
  findOpenCreditStatement,
  sumCardLiabilityForStatement,
}
