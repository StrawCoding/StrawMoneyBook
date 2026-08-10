import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { splitSqlStatements } from '../src/core/db/sql-statements.js'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js')

const migration009 = readFileSync(
  resolve(import.meta.dirname, '../src/core/db/migrations/009_allow_zero_amount_transaction.sql'),
  'utf8',
)
const migration026 = readFileSync(
  resolve(import.meta.dirname, '../src/core/db/migrations/026_transaction_origin_type_refund.sql'),
  'utf8',
)

function runSqlScript(db, sql) {
  for (const statement of splitSqlStatements(sql)) {
    db.run(statement)
  }
}

function seedPreRebuildSchema(db, { withAdvances = false, allowZeroAmount = false, allowRefundOrigin = false } = {}) {
  const amountCheck = allowZeroAmount ? '' : 'CHECK (amount_minor <> 0)'
  const originValues = allowRefundOrigin
    ? "'manual','loan_payment','reimbursement','import','recurring','refund'"
    : "'manual','loan_payment','reimbursement','import','recurring'"
  db.run('PRAGMA foreign_keys = ON;')
  db.run(`
    CREATE TABLE ledgers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE accounts (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
    );
    CREATE TABLE categories (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
    );
    CREATE TABLE counterparties (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
    );
    CREATE TABLE loans (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      counterparty_id TEXT NOT NULL,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id, counterparty_id) REFERENCES counterparties(ledger_id, id) ON DELETE RESTRICT
    );
    CREATE TABLE transactions (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('expense','income','adjustment','transfer')),
      transfer_group_id TEXT,
      account_id TEXT NOT NULL,
      peer_account_id TEXT,
      category_id TEXT,
      amount_minor INTEGER NOT NULL ${amountCheck},
      occurred_at TEXT NOT NULL,
      note TEXT,
      location TEXT,
      tags_json TEXT,
      origin_type TEXT NOT NULL DEFAULT 'manual' CHECK (origin_type IN (${originValues})),
      external_ref_id TEXT,
      idempotency_key TEXT,
      include_in_budget INTEGER NOT NULL DEFAULT 1 CHECK (include_in_budget IN (0,1)),
      include_in_analysis INTEGER NOT NULL DEFAULT 1 CHECK (include_in_analysis IN (0,1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      is_reimbursable INTEGER NOT NULL DEFAULT 0 CHECK (is_reimbursable IN (0,1)),
      reimbursement_state TEXT NOT NULL DEFAULT 'none' CHECK (reimbursement_state IN ('none','pending','reimbursed')),
      reimbursed_at TEXT,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id, account_id) REFERENCES accounts(ledger_id, id) ON DELETE RESTRICT,
      FOREIGN KEY (ledger_id, peer_account_id) REFERENCES accounts(ledger_id, id) ON DELETE RESTRICT,
      FOREIGN KEY (ledger_id, category_id) REFERENCES categories(ledger_id, id) ON DELETE RESTRICT
    );
    CREATE TABLE transaction_attachments (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      file_uri TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      checksum TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id, transaction_id) REFERENCES transactions(ledger_id, id) ON DELETE CASCADE
    );
    CREATE TABLE loan_payments (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      loan_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      generated_tx_id TEXT,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id, loan_id) REFERENCES loans(ledger_id, id) ON DELETE CASCADE,
      FOREIGN KEY (ledger_id, account_id) REFERENCES accounts(ledger_id, id) ON DELETE RESTRICT,
      FOREIGN KEY (ledger_id, generated_tx_id) REFERENCES transactions(ledger_id, id) ON DELETE SET NULL
    );
    CREATE TABLE reimbursements (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      paid_tx_id TEXT,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id, paid_tx_id) REFERENCES transactions(ledger_id, id) ON DELETE SET NULL
    );
    CREATE TABLE reimbursement_items (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      reimbursement_id TEXT NOT NULL,
      transaction_id TEXT,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id, reimbursement_id) REFERENCES reimbursements(ledger_id, id) ON DELETE CASCADE,
      FOREIGN KEY (ledger_id, transaction_id) REFERENCES transactions(ledger_id, id) ON DELETE SET NULL
    );
    CREATE TABLE bank_connections (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
    );
    CREATE TABLE bank_accounts (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id, connection_id) REFERENCES bank_connections(ledger_id, id) ON DELETE CASCADE
    );
    CREATE TABLE bank_transactions (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      bank_account_id TEXT NOT NULL,
      imported_txn_id TEXT,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id, connection_id) REFERENCES bank_connections(ledger_id, id) ON DELETE CASCADE,
      FOREIGN KEY (ledger_id, bank_account_id) REFERENCES bank_accounts(ledger_id, id) ON DELETE CASCADE,
      FOREIGN KEY (ledger_id, imported_txn_id) REFERENCES transactions(ledger_id, id) ON DELETE SET NULL
    );
  `)

  if (withAdvances) {
    db.run(`
      CREATE TABLE reimbursement_advances (
        ledger_id TEXT NOT NULL,
        id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        source_tx_id TEXT,
        PRIMARY KEY (ledger_id, id),
        FOREIGN KEY (ledger_id, account_id) REFERENCES accounts(ledger_id, id) ON DELETE CASCADE,
        FOREIGN KEY (ledger_id, source_tx_id) REFERENCES transactions(ledger_id, id) ON DELETE SET NULL
      );
      CREATE TABLE reimbursement_advance_usages (
        ledger_id TEXT NOT NULL,
        id TEXT NOT NULL,
        advance_id TEXT NOT NULL,
        expense_tx_id TEXT NOT NULL,
        PRIMARY KEY (ledger_id, id),
        FOREIGN KEY (ledger_id, advance_id) REFERENCES reimbursement_advances(ledger_id, id) ON DELETE CASCADE,
        FOREIGN KEY (ledger_id, expense_tx_id) REFERENCES transactions(ledger_id, id) ON DELETE CASCADE
      );
    `)
  }

  const ts = '2026-08-10T00:00:00.000Z'
  db.run('INSERT INTO ledgers (id, name) VALUES (?, ?);', ['L', 'Ledger'])
  db.run('INSERT INTO accounts (ledger_id, id, name) VALUES (?, ?, ?);', ['L', 'A', 'Cash'])
  db.run('INSERT INTO categories (ledger_id, id, name) VALUES (?, ?, ?);', ['L', 'C', 'Food'])
  db.run('INSERT INTO counterparties (ledger_id, id, name) VALUES (?, ?, ?);', ['L', 'CP', 'Bob'])
  db.run('INSERT INTO loans (ledger_id, id, counterparty_id) VALUES (?, ?, ?);', ['L', 'LOAN', 'CP'])
  db.run(
    `INSERT INTO transactions (
      ledger_id, id, type, account_id, category_id, amount_minor, occurred_at,
      origin_type, include_in_budget, include_in_analysis, created_at, updated_at,
      is_reimbursable, reimbursement_state
    ) VALUES (?, ?, 'expense', ?, ?, 100, ?, 'manual', 1, 1, ?, ?, 0, 'none');`,
    ['L', 'T1', 'A', 'C', ts, ts, ts],
  )
  db.run(
    `INSERT INTO transaction_attachments (
      ledger_id, id, transaction_id, file_uri, mime_type, file_size, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
    ['L', 'ATT', 'T1', 'file://a.jpg', 'image/jpeg', 1, ts],
  )
  db.run(
    'INSERT INTO loan_payments (ledger_id, id, loan_id, account_id, generated_tx_id) VALUES (?, ?, ?, ?, ?);',
    ['L', 'LP', 'LOAN', 'A', 'T1'],
  )
  db.run('INSERT INTO reimbursements (ledger_id, id, paid_tx_id) VALUES (?, ?, ?);', ['L', 'R', 'T1'])
  db.run(
    'INSERT INTO reimbursement_items (ledger_id, id, reimbursement_id, transaction_id) VALUES (?, ?, ?, ?);',
    ['L', 'RI', 'R', 'T1'],
  )
  db.run('INSERT INTO bank_connections (ledger_id, id) VALUES (?, ?);', ['L', 'BC'])
  db.run('INSERT INTO bank_accounts (ledger_id, id, connection_id) VALUES (?, ?, ?);', ['L', 'BA', 'BC'])
  db.run(
    `INSERT INTO bank_transactions (
      ledger_id, id, connection_id, bank_account_id, imported_txn_id
    ) VALUES (?, ?, ?, ?, ?);`,
    ['L', 'BT', 'BC', 'BA', 'T1'],
  )

  if (withAdvances) {
    db.run(
      'INSERT INTO reimbursement_advances (ledger_id, id, account_id, source_tx_id) VALUES (?, ?, ?, ?);',
      ['L', 'ADV', 'A', 'T1'],
    )
    db.run(
      'INSERT INTO reimbursement_advance_usages (ledger_id, id, advance_id, expense_tx_id) VALUES (?, ?, ?, ?);',
      ['L', 'AU', 'ADV', 'T1'],
    )
  }
}

function assertChildRefsIntact(db, { withAdvances = false } = {}) {
  assert.equal(db.exec('SELECT COUNT(*) FROM transaction_attachments;')[0].values[0][0], 1)
  assert.equal(
    db.exec('SELECT generated_tx_id FROM loan_payments WHERE id = \'LP\';')[0].values[0][0],
    'T1',
  )
  assert.equal(
    db.exec('SELECT paid_tx_id FROM reimbursements WHERE id = \'R\';')[0].values[0][0],
    'T1',
  )
  assert.equal(
    db.exec('SELECT transaction_id FROM reimbursement_items WHERE id = \'RI\';')[0].values[0][0],
    'T1',
  )
  assert.equal(
    db.exec('SELECT imported_txn_id FROM bank_transactions WHERE id = \'BT\';')[0].values[0][0],
    'T1',
  )
  if (withAdvances) {
    assert.equal(
      db.exec('SELECT source_tx_id FROM reimbursement_advances WHERE id = \'ADV\';')[0].values[0][0],
      'T1',
    )
    assert.equal(db.exec('SELECT COUNT(*) FROM reimbursement_advance_usages;')[0].values[0][0], 1)
  }
}

test('smb296: migration 009 rebuild keeps child FK refs under foreign_keys=ON (no OFF)', async () => {
  assert.doesNotMatch(migration009, /PRAGMA\s+foreign_keys\s*=\s*OFF/i)

  const SQL = await initSqlJs()
  const db = new SQL.Database()
  try {
    seedPreRebuildSchema(db)

    // Naive DROP under FK ON must fail (composite SET NULL / CASCADE) — proves why rebuild needs detach.
    let naiveFailed = false
    try {
      db.run('DROP TABLE transactions;')
    } catch (error) {
      naiveFailed = true
      assert.match(String(error?.message ?? error), /constraint|NOT NULL|FOREIGN KEY/i)
    }
    assert.equal(naiveFailed, true, 'naive DROP TABLE transactions must fail with FK ON')

    assert.doesNotThrow(() => runSqlScript(db, migration009))
    assert.equal(db.exec('PRAGMA foreign_keys;')[0].values[0][0], 1)
    assertChildRefsIntact(db)

    // Zero-amount now allowed after 009 rebuild.
    assert.doesNotThrow(() => {
      db.run(
        `INSERT INTO transactions (
          ledger_id, id, type, account_id, amount_minor, occurred_at,
          origin_type, include_in_budget, include_in_analysis, created_at, updated_at,
          is_reimbursable, reimbursement_state
        ) VALUES ('L', 'T0', 'expense', 'A', 0, '2026-08-10T00:00:00.000Z', 'manual', 1, 1,
          '2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z', 0, 'none');`,
      )
    })
  } finally {
    db.close()
  }
})

test('smb296: migration 026 rebuild preserves CASCADE/SET NULL children under foreign_keys=ON', async () => {
  assert.doesNotMatch(migration026, /PRAGMA\s+foreign_keys\s*=\s*OFF/i)

  const SQL = await initSqlJs()
  const db = new SQL.Database()
  try {
    // Post-009 / pre-026: zero amount already allowed, refund origin not yet, advances exist.
    seedPreRebuildSchema(db, { withAdvances: true, allowZeroAmount: true, allowRefundOrigin: false })

    let refundBlocked = false
    try {
      db.run(
        `INSERT INTO transactions (
          ledger_id, id, type, account_id, amount_minor, occurred_at,
          origin_type, include_in_budget, include_in_analysis, created_at, updated_at,
          is_reimbursable, reimbursement_state
        ) VALUES ('L', 'TREF_PRE', 'income', 'A', 50, '2026-08-10T00:00:00.000Z', 'refund', 1, 1,
          '2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z', 0, 'none');`,
      )
    } catch (error) {
      refundBlocked = true
      assert.match(String(error?.message ?? error), /CHECK|constraint/i)
    }
    assert.equal(refundBlocked, true, 'pre-026 schema must reject refund origin_type')

    assert.doesNotThrow(() => runSqlScript(db, migration026))
    assert.equal(db.exec('PRAGMA foreign_keys;')[0].values[0][0], 1)
    assertChildRefsIntact(db, { withAdvances: true })

    assert.doesNotThrow(() => {
      db.run(
        `INSERT INTO transactions (
          ledger_id, id, type, account_id, amount_minor, occurred_at,
          origin_type, include_in_budget, include_in_analysis, created_at, updated_at,
          is_reimbursable, reimbursement_state
        ) VALUES ('L', 'TREF', 'income', 'A', 50, '2026-08-10T00:00:00.000Z', 'refund', 1, 1,
          '2026-08-10T00:00:00.000Z', '2026-08-10T00:00:00.000Z', 0, 'none');`,
      )
    })
  } finally {
    db.close()
  }
})
