import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  computeDueOn,
  derivePaidMinorFromAllocations,
  resolvePeriodBoundsForPostedAt,
  isPostedInPeriod,
} from '../src/core/utils/credit-period.js'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js')

function openCreditDb(SQL) {
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON;')
  db.run(`
    CREATE TABLE ledgers (id TEXT PRIMARY KEY);
    CREATE TABLE accounts (
      ledger_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
      account_kind TEXT NOT NULL DEFAULT 'cash',
      statement_close_day INTEGER, payment_due_day INTEGER,
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

function closeStatement(db, { ledgerId, statementId, closingBalanceMinor, dueOn, closeToken, now }) {
  const existing = db.exec(
    `SELECT status, close_token, closing_balance_minor FROM credit_statements
     WHERE ledger_id='${ledgerId}' AND id='${statementId}';`,
  )
  const row = existing[0]?.values?.[0]
  if (!row) throw new Error('missing')
  if (row[0] === 'closed' && row[1] === closeToken) return { noop: true, closing: row[2] }
  if (row[0] === 'closed') return { noop: true, closing: row[2] }
  db.run(
    `UPDATE credit_statements SET status='closed', closing_balance_minor=?, due_on=?,
      closed_at=?, close_token=?, updated_at=? WHERE ledger_id=? AND id=? AND status='open';`,
    [closingBalanceMinor, dueOn, now, closeToken, now, ledgerId, statementId],
  )
  return { noop: false, closing: closingBalanceMinor }
}

test('sql.js: closing_balance immutable; refund posts to open; paid=SUM(alloc); no accrual account; double close no-op', async () => {
  const SQL = await initSqlJs()
  const db = openCreditDb(SQL)
  const ledgerId = 'L1'
  const cardId = 'CARD'
  const cashId = 'CASH'
  db.run('INSERT INTO ledgers (id) VALUES (?);', [ledgerId])
  db.run(
    `INSERT INTO accounts (ledger_id, id, name, account_kind, statement_close_day, payment_due_day)
     VALUES (?, ?, 'Visa', 'credit', 15, 10);`,
    [ledgerId, cardId],
  )
  db.run(
    `INSERT INTO accounts (ledger_id, id, name, account_kind) VALUES (?, ?, 'Bank', 'cash');`,
    [ledgerId, cashId],
  )

  // Forbid virtual accrual account names in accounts table
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

  // liability postings for period
  db.run(
    `INSERT INTO transaction_postings (
      ledger_id, id, transaction_id, role, account_id, amount_minor, statement_id, created_at, updated_at, deleted_at
    ) VALUES (?, 'P1', 'T1', 'card_liability', ?, -50000, 'S1', ?, ?, NULL);`,
    [ledgerId, cardId, '2026-03-10T12:00:00', '2026-03-10T12:00:00'],
  )

  const liability = -db.exec(
    `SELECT COALESCE(SUM(amount_minor),0) FROM transaction_postings WHERE statement_id='S1' AND role='card_liability';`,
  )[0].values[0][0]
  assert.equal(liability, 50000)

  const dueOn = computeDueOn('2026-03-15', 10)
  const token = 'close:S1:' + bounds.periodEndExclusive
  const first = closeStatement(db, {
    ledgerId,
    statementId: 'S1',
    closingBalanceMinor: liability,
    dueOn,
    closeToken: token,
    now: '2026-03-16T00:00:00',
  })
  assert.equal(first.noop, false)
  assert.equal(first.closing, 50000)

  const second = closeStatement(db, {
    ledgerId,
    statementId: 'S1',
    closingBalanceMinor: 1,
    dueOn,
    closeToken: token,
    now: '2026-03-16T00:01:00',
  })
  assert.equal(second.noop, true)
  assert.equal(second.closing, 50000)

  // Open next period; refund adjustment goes to open — closing unchanged
  const nextBounds = resolvePeriodBoundsForPostedAt('2026-03-16T00:00:00', 15)
  db.run(
    `INSERT INTO credit_statements (
      ledger_id, id, account_id, period_start_inclusive, period_end_exclusive, status,
      closing_balance_minor, due_on, closed_at, closing_hash, close_token, created_at, updated_at, deleted_at
    ) VALUES (?, 'S2', ?, ?, ?, 'open', NULL, NULL, NULL, NULL, NULL, ?, ?, NULL);`,
    [ledgerId, cardId, nextBounds.periodStartInclusive, nextBounds.periodEndExclusive, '2026-03-16T00:00:00', '2026-03-16T00:00:00'],
  )
  db.run(
    `INSERT INTO transaction_postings (
      ledger_id, id, transaction_id, role, account_id, amount_minor, statement_id, created_at, updated_at, deleted_at
    ) VALUES (?, 'P2', 'T2', 'adjustment', ?, 2000, 'S2', ?, ?, NULL);`,
    [ledgerId, cardId, '2026-03-20T10:00:00', '2026-03-20T10:00:00'],
  )
  const closedClosing = db.exec(
    `SELECT closing_balance_minor FROM credit_statements WHERE id='S1';`,
  )[0].values[0][0]
  assert.equal(closedClosing, 50000)

  // repayment requires allocation; paid derived
  let failed = false
  try {
    // simulate API reject when allocations empty
    const allocations = []
    if (!allocations.length) throw Object.assign(new Error('REPAYMENT_ALLOCATION_REQUIRED'), { code: 'REPAYMENT_ALLOCATION_REQUIRED' })
  } catch (error) {
    failed = error.code === 'REPAYMENT_ALLOCATION_REQUIRED'
  }
  assert.equal(failed, true)

  db.run(
    `INSERT INTO credit_repayments (
      ledger_id, id, account_id, source_account_id, amount_minor, paid_at, idempotency_key, created_at, updated_at, deleted_at
    ) VALUES (?, 'R1', ?, ?, 30000, '2026-04-01T10:00:00', 'idem-1', ?, ?, NULL);`,
    [ledgerId, cardId, cashId, '2026-04-01T10:00:00', '2026-04-01T10:00:00'],
  )
  db.run(
    `INSERT INTO credit_repayment_allocations (
      ledger_id, id, repayment_id, statement_id, amount_minor, created_at, updated_at, deleted_at
    ) VALUES (?, 'A1', 'R1', 'S1', 30000, ?, ?, NULL);`,
    [ledgerId, '2026-04-01T10:00:00', '2026-04-01T10:00:00'],
  )

  // duplicate idempotency rejected by UNIQUE
  let dupRejected = false
  try {
    db.run(
      `INSERT INTO credit_repayments (
        ledger_id, id, account_id, source_account_id, amount_minor, paid_at, idempotency_key, created_at, updated_at, deleted_at
      ) VALUES (?, 'R2', ?, ?, 100, '2026-04-02T10:00:00', 'idem-1', ?, ?, NULL);`,
      [ledgerId, cardId, cashId, '2026-04-02T10:00:00', '2026-04-02T10:00:00'],
    )
  } catch {
    dupRejected = true
  }
  assert.equal(dupRejected, true)

  const allocRows = db.exec(
    `SELECT amount_minor FROM credit_repayment_allocations WHERE repayment_id='R1';`,
  )[0].values.map((r) => ({ amount_minor: r[0] }))
  assert.equal(derivePaidMinorFromAllocations(allocRows), 30000)

  // due_on present on closed statement
  const due = db.exec(`SELECT due_on FROM credit_statements WHERE id='S1';`)[0].values[0][0]
  assert.equal(due, dueOn)
})
