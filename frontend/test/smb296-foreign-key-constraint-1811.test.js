import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import {
  createForeignKeyConstraintError,
  formatSyncForeignKeyError,
  isForeignKeyError,
  SQLITE_FOREIGN_KEY_ERROR_CODE,
  SQLITE_FOREIGN_KEY_ERROR_NUMERIC,
} from '../src/core/utils/sqlite-fk.js'
import { normalizeSharedLedgerSnapshot } from '../src/ui/services/shared-ledger/snapshot-merge.js'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js')

function buildOrphanSnapshot() {
  return {
    schema_version: 1,
    ledger_id: 'ledger_fk',
    exported_at: '2026-08-10T00:00:00.000Z',
    tables: {
      ledgers: [{
        id: 'ledger_fk',
        name: 'FK Test',
        currency_code: 'TWD',
        timezone: 'Asia/Taipei',
        created_at: '2026-08-10T00:00:00.000Z',
        updated_at: '2026-08-10T00:00:00.000Z',
      }],
      account_groups: [],
      accounts: [{
        id: 'acc_orphan',
        group_id: 'group_missing',
        name: '孤兒帳戶',
        account_type: 'asset',
        account_kind: 'cash',
        allow_negative: 0,
        opening_balance_minor: 0,
        currency_code: 'TWD',
        sort_order: 0,
        is_archived: 0,
        created_at: '2026-08-10T00:00:00.000Z',
        updated_at: '2026-08-10T00:00:00.000Z',
      }],
      category_groups: [],
      categories: [],
      transactions: [{
        id: 'tx_orphan',
        type: 'expense',
        account_id: 'acc_orphan',
        category_id: null,
        amount_minor: 100,
        occurred_at: '2026-08-10T00:00:00.000Z',
        origin_type: 'manual',
        include_in_budget: 1,
        include_in_analysis: 1,
        created_at: '2026-08-10T00:00:00.000Z',
        updated_at: '2026-08-10T00:00:00.000Z',
      }],
      transaction_attachments: [{
        id: 'att_orphan',
        transaction_id: 'tx_orphan',
        file_uri: 'file://orphan.jpg',
        mime_type: 'image/jpeg',
        file_size: 1,
        created_at: '2026-08-10T00:00:00.000Z',
      }],
      deleted_log: [],
    },
  }
}

function openFkDb(SQL) {
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON;')
  db.run(`
    CREATE TABLE ledgers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE account_groups (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
    );
    CREATE TABLE accounts (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id, group_id) REFERENCES account_groups(ledger_id, id) ON DELETE RESTRICT
    );
    CREATE TABLE transactions (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id, account_id) REFERENCES accounts(ledger_id, id) ON DELETE RESTRICT
    );
    CREATE TABLE transaction_attachments (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      file_uri TEXT NOT NULL,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id, transaction_id) REFERENCES transactions(ledger_id, id) ON DELETE CASCADE
    );
  `)
  return db
}

function insertSnapshotRows(db, snapshot) {
  const ledgerId = snapshot.ledger_id
  for (const row of snapshot.tables.ledgers ?? []) {
    db.run('INSERT INTO ledgers (id, name) VALUES (?, ?);', [row.id, row.name])
  }
  for (const row of snapshot.tables.account_groups ?? []) {
    db.run(
      'INSERT INTO account_groups (ledger_id, id, name) VALUES (?, ?, ?);',
      [ledgerId, row.id, row.name],
    )
  }
  for (const row of snapshot.tables.accounts ?? []) {
    db.run(
      'INSERT INTO accounts (ledger_id, id, group_id, name) VALUES (?, ?, ?, ?);',
      [ledgerId, row.id, row.group_id, row.name],
    )
  }
  for (const row of snapshot.tables.transactions ?? []) {
    db.run(
      'INSERT INTO transactions (ledger_id, id, account_id, amount_minor) VALUES (?, ?, ?, ?);',
      [ledgerId, row.id, row.account_id, row.amount_minor],
    )
  }
  for (const row of snapshot.tables.transaction_attachments ?? []) {
    db.run(
      'INSERT INTO transaction_attachments (ledger_id, id, transaction_id, file_uri) VALUES (?, ?, ?, ?);',
      [ledgerId, row.id, row.transaction_id, row.file_uri],
    )
  }
}

test('isForeignKeyError detects SQLITE 1811 / foreign key messages', () => {
  assert.equal(isForeignKeyError(new Error('FOREIGN KEY constraint failed')), true)
  assert.equal(isForeignKeyError(new Error('SqliteError: FOREIGN KEY constraint failed (code 1811)')), true)
  assert.equal(isForeignKeyError({ message: 'constraint failed', numericCode: 1811 }), true)
  assert.equal(isForeignKeyError(createForeignKeyConstraintError(new Error('FOREIGN KEY constraint failed'))), true)
  assert.equal(isForeignKeyError(new Error('UNIQUE constraint failed')), false)
  assert.equal(isForeignKeyError(new Error('CHECK constraint failed')), false)
})

test('createForeignKeyConstraintError exposes typed code and recoverable user message', () => {
  const error = createForeignKeyConstraintError(new Error('FOREIGN KEY constraint failed (code 1811)'))
  assert.equal(error.code, SQLITE_FOREIGN_KEY_ERROR_CODE)
  assert.equal(error.numericCode, SQLITE_FOREIGN_KEY_ERROR_NUMERIC)
  assert.equal(error.i18nKey, 'sqlite.error.foreign_key_constraint')
  assert.equal(error.recoverable, true)
  assert.match(error.message, /資料關聯不一致|foreign key|外鍵/i)
  assert.match(formatSyncForeignKeyError(error), /資料關聯不一致|foreign key|外鍵/i)
})

test('smb296: orphan snapshot insert with FK ON throws FOREIGN KEY; normalize then import succeeds', async () => {
  const SQL = await initSqlJs()
  const orphan = buildOrphanSnapshot()

  const rawDb = openFkDb(SQL)
  let threw = false
  try {
    insertSnapshotRows(rawDb, orphan)
  } catch (error) {
    threw = true
    assert.match(String(error?.message ?? error), /FOREIGN KEY|constraint failed|1811/i)
    assert.equal(isForeignKeyError(error), true)
  } finally {
    rawDb.close()
  }
  assert.equal(threw, true, 'raw orphan insert must fail under PRAGMA foreign_keys=ON')

  const normalized = normalizeSharedLedgerSnapshot(orphan)
  assert.equal(normalized.tables.accounts.length, 0)
  assert.equal(normalized.tables.transactions.length, 0)
  assert.equal(normalized.tables.transaction_attachments.length, 0)

  const fixedDb = openFkDb(SQL)
  try {
    assert.doesNotThrow(() => insertSnapshotRows(fixedDb, normalized))
    const ledgerCount = fixedDb.exec('SELECT COUNT(*) AS c FROM ledgers;')[0].values[0][0]
    const accountCount = fixedDb.exec('SELECT COUNT(*) AS c FROM accounts;')[0].values[0][0]
    const txCount = fixedDb.exec('SELECT COUNT(*) AS c FROM transactions;')[0].values[0][0]
    assert.equal(ledgerCount, 1)
    assert.equal(accountCount, 0)
    assert.equal(txCount, 0)
  } finally {
    fixedDb.close()
  }
})

test('smb296: optional FK nulling keeps valid parent rows and drops invalid refs before insert', async () => {
  const SQL = await initSqlJs()
  const snapshot = {
    schema_version: 1,
    ledger_id: 'ledger_fk',
    tables: {
      ledgers: [{ id: 'ledger_fk', name: 'FK' }],
      account_groups: [{ id: 'group_cash', name: '現金' }],
      accounts: [{ id: 'acc_cash', group_id: 'group_cash', name: '現金' }],
      category_groups: [],
      categories: [],
      transactions: [{
        id: 'tx_ok',
        account_id: 'acc_cash',
        peer_account_id: 'acc_missing',
        category_id: 'cat_missing',
        amount_minor: 50,
      }],
      deleted_log: [],
    },
  }

  const normalized = normalizeSharedLedgerSnapshot(snapshot)
  const tx = normalized.tables.transactions.find((row) => row.id === 'tx_ok')
  assert.ok(tx)
  assert.equal(tx.peer_account_id, null)
  assert.equal(tx.category_id, null)

  const db = openFkDb(SQL)
  try {
    assert.doesNotThrow(() => insertSnapshotRows(db, {
      ...normalized,
      tables: {
        ...normalized.tables,
        // Minimal insert helper ignores optional columns; assert parent/child rows exist.
        transactions: [{
          id: tx.id,
          account_id: tx.account_id,
          amount_minor: tx.amount_minor,
        }],
      },
    }))
    assert.equal(db.exec('SELECT COUNT(*) FROM accounts;')[0].values[0][0], 1)
    assert.equal(db.exec('SELECT COUNT(*) FROM transactions;')[0].values[0][0], 1)
  } finally {
    db.close()
  }
})

test('smb296: tombstoned parent with newer child resurrects then inserts without FOREIGN KEY 1811', async () => {
  const SQL = await initSqlJs()
  const snapshot = {
    schema_version: 1,
    ledger_id: 'ledger_fk',
    tables: {
      ledgers: [{ id: 'ledger_fk', name: 'FK' }],
      account_groups: [],
      accounts: [],
      category_groups: [],
      categories: [],
      transactions: [{
        id: 'tx_alive',
        account_id: 'acc_tombstoned',
        amount_minor: 80,
        updated_at: '2026-08-10T12:00:00.000Z',
      }],
      transaction_attachments: [],
      deleted_log: [
        {
          table_name: 'accounts',
          row_pk: 'acc_tombstoned',
          deleted_at: '2026-08-10T10:00:00.000Z',
          payload_json: JSON.stringify({
            id: 'acc_tombstoned',
            group_id: 'group_cash',
            name: '復活帳戶',
            updated_at: '2026-08-10T09:00:00.000Z',
          }),
        },
        {
          table_name: 'account_groups',
          row_pk: 'group_cash',
          deleted_at: '2026-08-10T10:00:00.000Z',
          payload_json: JSON.stringify({
            id: 'group_cash',
            name: '現金',
            updated_at: '2026-08-10T08:00:00.000Z',
          }),
        },
      ],
    },
  }

  // Without normalize: missing account parent → FK 1811.
  const rawDb = openFkDb(SQL)
  let threw = false
  try {
    insertSnapshotRows(rawDb, {
      ...snapshot,
      tables: {
        ...snapshot.tables,
        account_groups: [{ id: 'group_cash', name: '現金' }],
        accounts: [],
      },
    })
  } catch (error) {
    threw = true
    assert.match(String(error?.message ?? error), /FOREIGN KEY|constraint failed|1811/i)
  } finally {
    rawDb.close()
  }
  assert.equal(threw, true)

  const normalized = normalizeSharedLedgerSnapshot(snapshot)
  assert.ok(normalized.tables.accounts.some((row) => row.id === 'acc_tombstoned'), 'account must resurrect from tombstone')
  assert.ok(normalized.tables.account_groups.some((row) => row.id === 'group_cash'), 'group must resurrect after account')
  assert.ok(normalized.tables.transactions.some((row) => row.id === 'tx_alive'))
  assert.equal(
    (normalized.tables.deleted_log ?? []).some((row) => row.row_pk === 'acc_tombstoned'),
    false,
    'resurrected account tombstone must be cleared',
  )
  assert.equal(
    (normalized.tables.deleted_log ?? []).some((row) => row.row_pk === 'group_cash'),
    false,
    'resurrected group tombstone must be cleared',
  )

  const fixedDb = openFkDb(SQL)
  try {
    assert.doesNotThrow(() => insertSnapshotRows(fixedDb, normalized))
    assert.equal(fixedDb.exec('SELECT COUNT(*) FROM account_groups;')[0].values[0][0], 1)
    assert.equal(fixedDb.exec('SELECT COUNT(*) FROM accounts;')[0].values[0][0], 1)
    assert.equal(fixedDb.exec('SELECT COUNT(*) FROM transactions;')[0].values[0][0], 1)
  } finally {
    fixedDb.close()
  }
})
