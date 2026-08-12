import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  computeDueOn,
  derivePaidMinorFromAllocations,
  resolvePeriodBoundsForPostedAt,
  isPostedInPeriod,
} from '../src/core/utils/credit-period.js'
import {
  applyCreditRefundAdjustmentPlan,
  applyCreditRepaymentAllocationPlan,
  applyCreditStatementClose,
  applyUpdateManualTransactionFields,
  assertUpdateManualCreditMutationAllowed,
  buildCreditRefundAdjustmentPlan,
  buildUpdateManualTransactionFields,
  chooseRefundFormalPath,
  clampPostedAtIntoOpenPeriod,
  computeActualCardDebtMinor,
  computeCreditUtilization,
  diffCreditManualTransactionChanges,
  shouldForbidClosedCreditMutation,
  validateRepaymentAllocationPlan,
} from '../src/core/utils/credit-card-apply.js'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js')
const root = resolve(import.meta.dirname, '..')

function openCreditDb(SQL) {
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON;')
  db.run(`
    CREATE TABLE ledgers (id TEXT PRIMARY KEY);
    CREATE TABLE accounts (
      ledger_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
      account_kind TEXT NOT NULL DEFAULT 'cash',
      statement_close_day INTEGER, payment_due_day INTEGER,
      credit_limit_minor INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (ledger_id, id)
    );
    CREATE TABLE transactions (
      ledger_id TEXT NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL,
      account_id TEXT, category_id TEXT, amount_minor INTEGER NOT NULL,
      occurred_at TEXT NOT NULL, posted_at TEXT, note TEXT,
      origin_type TEXT, external_ref_id TEXT,
      include_in_budget INTEGER NOT NULL DEFAULT 1,
      include_in_analysis INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
      PRIMARY KEY (ledger_id, id)
    );
    CREATE TABLE credit_statements (
      ledger_id TEXT NOT NULL, id TEXT NOT NULL, account_id TEXT NOT NULL,
      period_start_inclusive TEXT NOT NULL, period_end_exclusive TEXT NOT NULL,
      status TEXT NOT NULL, closing_balance_minor INTEGER, due_on TEXT,
      closed_at TEXT, closing_hash TEXT, close_token TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
      PRIMARY KEY (ledger_id, id),
      UNIQUE (ledger_id, account_id, period_start_inclusive)
    );
    CREATE UNIQUE INDEX idx_one_open ON credit_statements(ledger_id, account_id)
      WHERE status='open' AND deleted_at IS NULL;
    CREATE TABLE credit_repayments (
      ledger_id TEXT NOT NULL, id TEXT NOT NULL, account_id TEXT NOT NULL,
      source_account_id TEXT NOT NULL, amount_minor INTEGER NOT NULL,
      paid_at TEXT NOT NULL, idempotency_key TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
      PRIMARY KEY (ledger_id, id),
      UNIQUE (ledger_id, idempotency_key)
    );
    CREATE TABLE credit_repayment_allocations (
      ledger_id TEXT NOT NULL, id TEXT NOT NULL, repayment_id TEXT NOT NULL,
      statement_id TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
      PRIMARY KEY (ledger_id, id),
      UNIQUE (ledger_id, repayment_id, statement_id)
    );
    CREATE TABLE transaction_postings (
      ledger_id TEXT NOT NULL, id TEXT NOT NULL, transaction_id TEXT NOT NULL,
      role TEXT NOT NULL, account_id TEXT, amount_minor INTEGER NOT NULL,
      statement_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
      PRIMARY KEY (ledger_id, id)
    );
  `)
  return db
}

function seedCard(db, { ledgerId = 'L1', cardId = 'CARD', cashId = 'CASH', otherCardId = 'CARD2' } = {}) {
  db.run('INSERT INTO ledgers (id) VALUES (?);', [ledgerId])
  db.run(
    `INSERT INTO accounts (ledger_id, id, name, account_kind, statement_close_day, payment_due_day, credit_limit_minor)
     VALUES (?, ?, 'Visa', 'credit', 15, 10, 100000);`,
    [ledgerId, cardId],
  )
  db.run(
    `INSERT INTO accounts (ledger_id, id, name, account_kind, statement_close_day, payment_due_day, credit_limit_minor)
     VALUES (?, ?, 'Master', 'credit', 20, 15, 50000);`,
    [ledgerId, otherCardId],
  )
  db.run(
    `INSERT INTO accounts (ledger_id, id, name, account_kind) VALUES (?, ?, 'Bank', 'cash');`,
    [ledgerId, cashId],
  )
  return { ledgerId, cardId, cashId, otherCardId }
}

test('sql.js formal path: refund→open posting; closed immutable; alloc same-card/remaining; debt util; batch forbid', async () => {
  const SQL = await initSqlJs()
  const db = openCreditDb(SQL)
  const { ledgerId, cardId, cashId, otherCardId } = seedCard(db)

  // No virtual accrual account
  const names = db.exec(`SELECT name FROM accounts WHERE ledger_id='${ledgerId}';`)[0].values.map((r) => r[0])
  assert.equal(names.some((n) => String(n).toLowerCase().includes('credit-accrual')), false)

  const bounds = resolvePeriodBoundsForPostedAt('2026-03-10T12:00:00', 15)
  assert.equal(isPostedInPeriod('2026-03-15T23:59:59', bounds.periodStartInclusive, bounds.periodEndExclusive), true)
  assert.equal(isPostedInPeriod('2026-03-16T00:00:00', bounds.periodStartInclusive, bounds.periodEndExclusive), false)

  db.run(
    `INSERT INTO credit_statements (
      ledger_id, id, account_id, period_start_inclusive, period_end_exclusive, status,
      closing_balance_minor, due_on, closed_at, closing_hash, close_token, created_at, updated_at, deleted_at
    ) VALUES (?, 'S1', ?, ?, ?, 'open', NULL, NULL, NULL, NULL, NULL, ?, ?, NULL);`,
    [ledgerId, cardId, bounds.periodStartInclusive, bounds.periodEndExclusive, '2026-03-01T00:00:00', '2026-03-01T00:00:00'],
  )

  // Purchase liability on S1 (negative = debt increase)
  db.run(
    `INSERT INTO transaction_postings (
      ledger_id, id, transaction_id, role, account_id, amount_minor, statement_id, created_at, updated_at, deleted_at
    ) VALUES (?, 'P1', 'T1', 'card_liability', ?, -50000, 'S1', ?, ?, NULL);`,
    [ledgerId, cardId, '2026-03-10T12:00:00', '2026-03-10T12:00:00'],
  )
  db.run(
    `INSERT INTO transactions (
      ledger_id, id, type, account_id, category_id, amount_minor, occurred_at, posted_at, note, origin_type,
      include_in_budget, include_in_analysis, created_at, updated_at, deleted_at
    ) VALUES (?, 'T1', 'expense', ?, 'cat_food', -50000, '2026-03-10T12:00:00', '2026-03-10T12:00:00', '刷卡', 'manual', 1, 1, ?, ?, NULL);`,
    [ledgerId, cardId, '2026-03-10T12:00:00', '2026-03-10T12:00:00'],
  )

  const liability = -db.exec(
    `SELECT COALESCE(SUM(amount_minor),0) FROM transaction_postings WHERE statement_id='S1' AND role='card_liability';`,
  )[0].values[0][0]
  assert.equal(liability, 50000)

  const dueOn = computeDueOn('2026-03-15', 10)
  const token = `close:S1:${bounds.periodEndExclusive}`
  const first = applyCreditStatementClose(db, {
    ledgerId,
    statementId: 'S1',
    closingBalanceMinor: liability,
    dueOn,
    closeToken: token,
    now: '2026-03-16T00:00:00',
  })
  assert.equal(first.noop, false)
  assert.equal(first.closing, 50000)

  // Double close / wrong closing attempt → no-op, closing immutable
  const second = applyCreditStatementClose(db, {
    ledgerId,
    statementId: 'S1',
    closingBalanceMinor: 1,
    dueOn,
    closeToken: token,
    now: '2026-03-16T00:01:00',
  })
  assert.equal(second.noop, true)
  assert.equal(second.closing, 50000)

  // Open next period
  const nextBounds = resolvePeriodBoundsForPostedAt('2026-03-16T00:00:00', 15)
  db.run(
    `INSERT INTO credit_statements (
      ledger_id, id, account_id, period_start_inclusive, period_end_exclusive, status,
      closing_balance_minor, due_on, closed_at, closing_hash, close_token, created_at, updated_at, deleted_at
    ) VALUES (?, 'S2', ?, ?, ?, 'open', NULL, NULL, NULL, NULL, NULL, ?, ?, NULL);`,
    [ledgerId, cardId, nextBounds.periodStartInclusive, nextBounds.periodEndExclusive, '2026-03-16T00:00:00', '2026-03-16T00:00:00'],
  )

  // Formal refund path: even if caller passes closed-period posted_at, clamp into OPEN
  assert.equal(chooseRefundFormalPath('credit'), 'credit_open_posting')
  assert.equal(chooseRefundFormalPath('cash'), 'legacy_adjustment')
  const clampedPosted = clampPostedAtIntoOpenPeriod(
    '2026-03-10T12:00:00', // inside closed S1
    {
      period_start_inclusive: nextBounds.periodStartInclusive,
      period_end_exclusive: nextBounds.periodEndExclusive,
    },
    '2026-03-20T10:00:00',
  )
  assert.equal(clampedPosted, '2026-03-20T10:00:00')

  const refundPlan = buildCreditRefundAdjustmentPlan({
    accountId: cardId,
    amountMinor: 2000,
    openStatementId: 'S2',
    openStatementStatus: 'open',
    occurredAt: '2026-03-10T12:00:00', // original purchase day (budget/calendar)
    postedAt: clampedPosted,
    externalRefId: 'T1',
    categoryId: 'cat_refund',
    transactionId: 'T_REFUND',
    postingId: 'P_REFUND',
  })
  assert.equal(refundPlan.posting.statementId, 'S2')
  assert.equal(refundPlan.transaction.originType, 'refund')
  assert.equal(refundPlan.transaction.postedAt, clampedPosted)
  applyCreditRefundAdjustmentPlan(db, ledgerId, refundPlan, { now: '2026-03-20T10:00:00' })

  const refundPosting = db.exec(
    `SELECT statement_id, role, amount_minor FROM transaction_postings WHERE id='P_REFUND';`,
  )[0].values[0]
  assert.equal(refundPosting[0], 'S2')
  assert.equal(refundPosting[1], 'adjustment')
  assert.equal(refundPosting[2], 2000)

  // Refund tx row exists with origin_type=refund (formal createRefundAdjustment credit path)
  const refundTx = db.exec(
    `SELECT origin_type, posted_at FROM transactions WHERE id='T_REFUND';`,
  )[0].values[0]
  assert.equal(refundTx[0], 'refund')
  assert.equal(refundTx[1], clampedPosted)

  const closedClosing = db.exec(
    `SELECT closing_balance_minor FROM credit_statements WHERE id='S1';`,
  )[0].values[0][0]
  assert.equal(closedClosing, 50000, 'closed closing_balance_minor must stay immutable after refund')

  // Refund into closed statement must be rejected by formal plan builder
  assert.throws(
    () => buildCreditRefundAdjustmentPlan({
      accountId: cardId,
      amountMinor: 100,
      openStatementId: 'S1',
      openStatementStatus: 'closed',
      occurredAt: '2026-03-20T10:00:00',
      postedAt: '2026-03-20T10:00:00',
    }),
    (err) => err.code === 'CLOSED_STATEMENT_POSTING_FORBIDDEN',
  )

  // Closed batch / category mutation forbidden
  assert.equal(shouldForbidClosedCreditMutation({
    status: 'closed',
    changes: { category: true, batch: true },
  }), true)
  assert.equal(shouldForbidClosedCreditMutation({
    status: 'closed',
    changes: { flags: true, batch: true },
  }), true)
  assert.equal(shouldForbidClosedCreditMutation({
    status: 'closed',
    changes: { occurredAt: true },
  }), false)
  assert.equal(shouldForbidClosedCreditMutation({
    status: 'open',
    changes: { category: true, batch: true },
  }), false)

  // Formal edit entry diff: UI omits postedAt; expense amount is positive in payload
  // while DB stores negative — must NOT flag postedAt/amount as changed.
  const closedRow = {
    id: 'T1',
    type: 'expense',
    account_id: cardId,
    category_id: 'cat_food',
    amount_minor: -50000,
    occurred_at: '2026-03-10T12:00:00',
    posted_at: '2026-03-10T12:00:00',
    note: '刷卡',
    is_reimbursable: 0,
    include_in_budget: 1,
    include_in_analysis: 1,
  }
  const pureOccurredPayload = {
    type: 'expense',
    accountId: cardId,
    categoryId: 'cat_food',
    amountMinor: 50000, // UI positive
    occurredAt: '2026-03-08T09:00:00', // only budget/calendar correction
    note: '刷卡',
    isReimbursable: false,
    includeInBudget: true,
    includeInAnalysis: true,
    // postedAt intentionally omitted (TransactionEditPage / HomeTransactionEditSheet)
  }
  const pureDiff = diffCreditManualTransactionChanges(closedRow, pureOccurredPayload)
  assert.deepEqual(pureDiff, {
    amount: false,
    account: false,
    postedAt: false,
    category: false,
    note: false,
    flags: false,
    occurredAt: true,
    delete: false,
    batch: false,
  })
  assert.equal(shouldForbidClosedCreditMutation({
    status: 'closed',
    changes: pureDiff,
  }), false)

  // Regression: old buggy fallback payload.postedAt ?? payload.occurredAt would forbid
  const buggyPostedAt = String(pureOccurredPayload.postedAt ?? pureOccurredPayload.occurredAt ?? '').trim()
  const buggyCurrentPosted = String(closedRow.posted_at ?? closedRow.occurred_at ?? '').trim()
  assert.equal(Boolean(buggyPostedAt) && buggyPostedAt !== buggyCurrentPosted, true)
  assert.equal(shouldForbidClosedCreditMutation({
    status: 'closed',
    changes: { ...pureDiff, postedAt: true, occurredAt: false },
  }), true)

  // Explicit postedAt change on closed → formal gate must forbid
  assert.throws(
    () => assertUpdateManualCreditMutationAllowed({
      currentTx: closedRow,
      payload: { ...pureOccurredPayload, postedAt: '2026-03-20T10:00:00' },
      status: 'closed',
    }),
    (err) => err.code === 'CLOSED_POSTING_MUTATION_FORBIDDEN',
  )

  // ── Formal updateManualTransaction path (not raw SQL / not helper-only) ──
  // Load findTransactionRecordById-shaped row from DB, gate, build fields, apply.
  const recordCols = db.exec(
    `SELECT id, type, account_id, category_id, amount_minor, occurred_at, posted_at, note,
            origin_type, include_in_budget, include_in_analysis
     FROM transactions WHERE id='T1';`,
  )[0]
  const recordVals = recordCols.values[0]
  const fullRecord = {
    id: recordVals[0],
    type: recordVals[1],
    account_id: recordVals[2],
    category_id: recordVals[3],
    amount_minor: recordVals[4],
    occurred_at: recordVals[5],
    posted_at: recordVals[6],
    note: recordVals[7],
    origin_type: recordVals[8],
    is_reimbursable: 0,
    include_in_budget: recordVals[9] ?? 1,
    include_in_analysis: recordVals[10] ?? 1,
  }
  assert.equal(fullRecord.posted_at, '2026-03-10T12:00:00')
  const beforeStmt = db.exec(
    `SELECT statement_id FROM transaction_postings WHERE transaction_id='T1';`,
  )[0].values[0][0]
  assert.equal(beforeStmt, 'S1')

  const gate = assertUpdateManualCreditMutationAllowed({
    currentTx: fullRecord,
    payload: pureOccurredPayload,
    status: 'closed',
  })
  assert.equal(gate.allowed, true)
  assert.equal(gate.changes.occurredAt, true)
  assert.equal(gate.changes.postedAt, false)

  const fields = buildUpdateManualTransactionFields(fullRecord, pureOccurredPayload)
  assert.equal(Object.prototype.hasOwnProperty.call(fields, 'postedAt'), false)
  assert.equal(fields.occurredAt, '2026-03-08T09:00:00')
  assert.equal(fields.amountMinor, -50000)

  applyUpdateManualTransactionFields(db, {
    ledgerId,
    txId: 'T1',
    fields,
    now: '2026-03-20T10:00:00',
  })

  const after = db.exec(
    `SELECT t.occurred_at, t.posted_at, p.statement_id, s.closing_balance_minor, s.status
     FROM transactions t
     JOIN transaction_postings p ON p.transaction_id = t.id
     JOIN credit_statements s ON s.id = p.statement_id
     WHERE t.id = 'T1';`,
  )[0].values[0]
  assert.equal(after[0], '2026-03-08T09:00:00')
  assert.equal(after[1], '2026-03-10T12:00:00') // posted_at unchanged
  assert.equal(after[2], 'S1') // statement_id unchanged
  assert.equal(after[3], 50000) // closing immutable
  assert.equal(after[4], 'closed')

  // Incomplete row (findTransactionById shape) must fail formal gate
  const incompleteRow = { id: 'T1', type: 'expense', origin_type: 'manual' }
  assert.throws(
    () => assertUpdateManualCreditMutationAllowed({
      currentTx: incompleteRow,
      payload: pureOccurredPayload,
      status: 'closed',
    }),
    (err) => err.code === 'CLOSED_POSTING_MUTATION_FORBIDDEN',
  )

  // Allocation: empty → fail
  assert.throws(
    () => validateRepaymentAllocationPlan({
      accountId: cardId,
      amountMinor: 30000,
      allocations: [],
      statementsById: {},
    }),
    (err) => err.code === 'REPAYMENT_ALLOCATION_REQUIRED',
  )

  // Cross-card allocation → fail
  assert.throws(
    () => validateRepaymentAllocationPlan({
      accountId: cardId,
      amountMinor: 1000,
      allocations: [{ statementId: 'OTHER', amountMinor: 1000 }],
      statementsById: {
        OTHER: { account_id: otherCardId, remaining_minor: 5000 },
      },
    }),
    (err) => err.code === 'ALLOCATION_CROSS_CARD_FORBIDDEN',
  )

  // Exceed remaining → fail
  assert.throws(
    () => validateRepaymentAllocationPlan({
      accountId: cardId,
      amountMinor: 40000,
      allocations: [{ statementId: 'S1', amountMinor: 40000 }],
      statementsById: {
        S1: { account_id: cardId, remaining_minor: 30000 },
      },
    }),
    (err) => err.code === 'ALLOCATION_EXCEEDS_REMAINING',
  )

  // Formal repayment allocation path (validated + applied)
  const validated = validateRepaymentAllocationPlan({
    accountId: cardId,
    amountMinor: 30000,
    allocations: [{ statementId: 'S1', amountMinor: 30000 }],
    statementsById: {
      S1: { account_id: cardId, remaining_minor: 50000 },
    },
  })
  assert.equal(validated.paidMinor, 30000)
  const repay = applyCreditRepaymentAllocationPlan(db, ledgerId, {
    repaymentId: 'R1',
    accountId: cardId,
    sourceAccountId: cashId,
    amountMinor: 30000,
    paidAt: '2026-04-01T10:00:00',
    idempotencyKey: 'idem-1',
    allocations: validated.allocations,
    now: '2026-04-01T10:00:00',
  })
  assert.equal(repay.paidMinor, 30000)

  // Duplicate idempotency rejected by UNIQUE
  let dupRejected = false
  try {
    applyCreditRepaymentAllocationPlan(db, ledgerId, {
      repaymentId: 'R2',
      accountId: cardId,
      sourceAccountId: cashId,
      amountMinor: 100,
      paidAt: '2026-04-02T10:00:00',
      idempotencyKey: 'idem-1',
      allocations: [{ statementId: 'S1', amountMinor: 100 }],
      now: '2026-04-02T10:00:00',
    })
  } catch {
    dupRejected = true
  }
  assert.equal(dupRejected, true)

  const allocRows = db.exec(
    `SELECT amount_minor FROM credit_repayment_allocations WHERE repayment_id='R1';`,
  )[0].values.map((r) => ({ amount_minor: r[0] }))
  assert.equal(derivePaidMinorFromAllocations(allocRows), 30000)

  // Actual card debt for limit alert = SUM(remaining), not bogus account balance
  const remainingS1 = 50000 - 30000
  // Open S2 has +2000 adjustment (liability decrease) → remaining from adjustment alone is 0 for debt
  // (adjustment amount_minor +2000 → sumCardLiability = -(+2000) = -2000 → max(0,...) in unpaid filter)
  // Simulate post-purchase open remaining 85000 against limit 100000 → nearLimit
  const debtAfterPurchase = computeActualCardDebtMinor([
    { remaining_minor: remainingS1 },
    { remaining_minor: 85000 },
  ])
  assert.equal(debtAfterPurchase, 105000)
  const utilPurchase = computeCreditUtilization({
    debtMinor: computeActualCardDebtMinor([{ remaining_minor: 85000 }]),
    creditLimitMinor: 100000,
  })
  assert.equal(utilPurchase.nearLimit, true)
  assert.equal(utilPurchase.utilization, 0.85)

  const debt = computeActualCardDebtMinor([
    { remaining_minor: remainingS1 },
    { remaining_minor: 0 },
  ])
  assert.equal(debt, 20000)
  const util = computeCreditUtilization({ debtMinor: debt, creditLimitMinor: 100000 })
  assert.equal(util.nearLimit, false)
  assert.equal(util.utilization, 0.2)
  const near = computeCreditUtilization({ debtMinor: 85000, creditLimitMinor: 100000 })
  assert.equal(near.nearLimit, true)

  // due_on present; overdue must not use reminder (covered in unit test; presence here)
  const due = db.exec(`SELECT due_on FROM credit_statements WHERE id='S1';`)[0].values[0][0]
  assert.equal(due, dueOn)
})

test('smb301 source wiring: formal refund/batch/alloc/debt paths', () => {
  const creditService = readFileSync(resolve(root, 'src/core/services/credit.service.js'), 'utf8')
  const txService = readFileSync(resolve(root, 'src/core/services/transaction.service.js'), 'utf8')
  const apply = readFileSync(resolve(root, 'src/core/utils/credit-card-apply.js'), 'utf8')

  assert.match(apply, /validateRepaymentAllocationPlan/)
  assert.match(apply, /ALLOCATION_CROSS_CARD_FORBIDDEN/)
  assert.match(apply, /ALLOCATION_EXCEEDS_REMAINING/)
  assert.match(apply, /buildCreditRefundAdjustmentPlan/)
  assert.match(apply, /clampPostedAtIntoOpenPeriod/)
  assert.match(apply, /chooseRefundFormalPath/)
  assert.match(apply, /computeActualCardDebtMinor/)
  assert.match(apply, /shouldForbidClosedCreditMutation/)
  assert.match(apply, /diffCreditManualTransactionChanges/)
  assert.match(apply, /assertUpdateManualCreditMutationAllowed/)
  assert.match(apply, /buildUpdateManualTransactionFields/)
  assert.match(apply, /applyUpdateManualTransactionFields/)
  assert.match(apply, /computeActualCardDebtMinor/)
  assert.match(apply, /clampPostedAtIntoOpenPeriod/)
  assert.match(apply, /chooseRefundFormalPath/)
  assert.match(apply, /hasExplicitPostedAt|postedAt intentionally|never fall back to occurredAt/i)

  assert.match(creditService, /validateRepaymentAllocationPlan/)
  assert.match(creditService, /computeActualCardDebtMinor/)
  assert.match(creditService, /buildCreditRefundAdjustmentPlan/)
  assert.match(creditService, /clampPostedAtIntoOpenPeriod/)
  assert.match(creditService, /shouldForbidClosedCreditMutation/)
  assert.match(creditService, /findOpenCreditStatement/)
  assert.match(creditService, /createCreditRefundAdjustment/)

  assert.match(txService, /createCreditRefundAdjustment/)
  assert.match(txService, /chooseRefundFormalPath/)
  assert.match(txService, /assertUpdateManualCreditMutationAllowed/)
  assert.match(txService, /buildUpdateManualTransactionFields/)
  assert.match(txService, /findTransactionRecordById/)
  assert.match(txService, /findPostingStatementStatus/)
  assert.match(txService, /CLOSED_POSTING_MUTATION_FORBIDDEN/)
  // Formal edit must load full row (posted_at) — not findTransactionById slim select
  const updateManualFn = txService.match(
    /export async function updateManualTransaction[\s\S]*?(?=\nexport async function )/,
  )?.[0] ?? ''
  assert.match(updateManualFn, /findTransactionRecordById/)
  assert.match(updateManualFn, /assertUpdateManualCreditMutationAllowed/)
  assert.match(updateManualFn, /buildUpdateManualTransactionFields/)
  // Must not infer postedAt from occurredAt in the formal edit gate
  assert.doesNotMatch(updateManualFn, /payload\.postedAt\s*\?\?\s*payload\.occurredAt/)
  // batch hard-fail (throw) — not soft-skip
  assert.match(txService, /batchPatchCategory[\s\S]*CLOSED_POSTING_MUTATION_FORBIDDEN[\s\S]*throw error/)
  assert.match(txService, /batchPatchTransactions[\s\S]*CLOSED_POSTING_MUTATION_FORBIDDEN[\s\S]*throw error/)
  assert.match(txService, /Hard reject|hard-fail|hard reject/i)

  const txRepo = readFileSync(resolve(root, 'src/core/repositories/transaction.repo.js'), 'utf8')
  assert.match(txRepo, /findTransactionRecordById[\s\S]*t\.posted_at/)
  // updateTransactionById must never SET posted_at
  assert.match(txRepo, /export async function updateTransactionById[\s\S]*?(?=\nexport async function )/)
  const updateByIdFn = txRepo.match(
    /export async function updateTransactionById[\s\S]*?(?=\nexport async function )/,
  )?.[0] ?? ''
  assert.doesNotMatch(updateByIdFn, /posted_at\s*=/)
})
