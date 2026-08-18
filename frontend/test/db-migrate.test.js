import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildMigrationStatementSet, executeMigrationSql } from '../src/core/db/migration-executor.js'
import { splitSqlStatements } from '../src/core/db/sql-statements.js'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js')

function createSqlJsMigrationDb(rawDb) {
  return {
    async executeSet(items) {
      for (const item of items) {
        rawDb.run(item.statement, item.values ?? [])
      }
    },
  }
}

function tableColumns(db, tableName) {
  return db.exec(`PRAGMA table_info(${tableName})`).flatMap((result) =>
    result.values.map((row) => String(row[1])),
  )
}

test('splitSqlStatements keeps trigger bodies intact', () => {
  const sql = `
    CREATE TABLE example (id TEXT, note TEXT);

    CREATE TRIGGER IF NOT EXISTS trg_example
    AFTER DELETE ON example
    BEGIN
      INSERT INTO deleted_log (row_pk, payload_json)
      VALUES (OLD.id, json_object('note', 'semi;colon'));
    END;

    CREATE INDEX idx_example_id ON example(id);
  `

  const statements = splitSqlStatements(sql)
  assert.equal(statements.length, 3)
  assert.match(statements[1], /CREATE TRIGGER IF NOT EXISTS trg_example/)
  assert.match(statements[1], /json_object\('note', 'semi;colon'\)/)
  assert.match(statements[1], /END;$/)
})

test('splitSqlStatements preserves the deleted log migration triggers', () => {
  const migrationPath = resolve(import.meta.dirname, '../src/core/db/migrations/018_shared_sync_deleted_log.sql')
  const sql = readFileSync(migrationPath, 'utf8')

  const statements = splitSqlStatements(sql)
  assert.equal(statements.length, 22)
  assert.match(statements[0], /CREATE INDEX IF NOT EXISTS idx_deleted_log_lookup/)
  assert.match(statements[1], /CREATE TRIGGER IF NOT EXISTS trg_deleted_log_account_groups/)
  assert.match(statements[21], /CREATE TRIGGER IF NOT EXISTS trg_deleted_log_app_settings/)
  assert.ok(statements.slice(1).every((statement) => statement.endsWith('END;')))
})

test('buildMigrationStatementSet keeps trigger statements intact without adding an extra semicolon', () => {
  const sql = `
    CREATE TABLE example (id TEXT);

    CREATE TRIGGER IF NOT EXISTS trg_example
    AFTER DELETE ON example
    BEGIN
      INSERT INTO deleted_log (row_pk) VALUES (OLD.id);
    END;
  `

  const set = buildMigrationStatementSet(sql)
  assert.equal(set.length, 2)
  assert.deepEqual(set[0], {
    statement: 'CREATE TABLE example (id TEXT);',
    values: [],
  })
  assert.equal(set[1].values.length, 0)
  assert.match(set[1].statement, /CREATE TRIGGER IF NOT EXISTS trg_example/)
  assert.match(set[1].statement, /END;$/)
  assert.doesNotMatch(set[1].statement, /END;;$/)
})

test('executeMigrationSql uses executeSet payloads and never falls back to execute', async () => {
  const calls = []
  const db = {
    async executeSet(set) {
      calls.push(set)
      return { changes: { changes: 0 } }
    },
    async execute() {
      throw new Error('execute should not be used for migrations')
    },
  }

  const sql = `
    CREATE TABLE example (id TEXT);

    CREATE TRIGGER IF NOT EXISTS trg_example
    AFTER DELETE ON example
    BEGIN
      INSERT INTO deleted_log (row_pk) VALUES (OLD.id);
    END;
  `

  await executeMigrationSql(db, sql)

  const statements = calls.map((item) => item[0].statement)
  assert.equal(statements[0], 'BEGIN;')
  assert.equal(statements.at(-1), 'COMMIT;')
  assert.ok(statements.includes('CREATE TABLE example (id TEXT);'))
  assert.ok(statements.some((statement) => statement.includes('CREATE TRIGGER IF NOT EXISTS trg_example')))
  assert.ok(calls.every((item) => Array.isArray(item)))
})

test('executeMigrationSql ignores duplicate schema errors when using executeSet', async () => {
  const calls = []
  const db = {
    async executeSet(set) {
      calls.push(set)
      const statement = String(set[0]?.statement ?? '')
      if (statement.includes('ALTER TABLE')) {
        throw new Error('duplicate column name: example')
      }
      return { changes: { changes: 0 } }
    },
  }

  await executeMigrationSql(db, `
    ALTER TABLE example ADD COLUMN sample TEXT;
    CREATE INDEX idx_example_sample ON example(sample);
  `)

  const statements = calls.map((item) => item[0].statement)
  assert.ok(statements.some((statement) => statement.includes('CREATE INDEX idx_example_sample')))
  assert.equal(statements.at(-1), 'COMMIT;')
})

test('executeMigrationSql does not wrap Capacitor plugin connections in beginTransaction', async () => {
  const calls = []
  const db = {
    async beginTransaction() {
      calls.push('beginTransaction')
    },
    async commitTransaction() {
      calls.push('commitTransaction')
    },
    async rollbackTransaction() {
      calls.push('rollbackTransaction')
    },
    async executeSet(set) {
      calls.push(set[0]?.statement)
      return { changes: { changes: 0 } }
    },
  }

  await executeMigrationSql(db, 'CREATE TABLE example (id TEXT);')

  assert.deepEqual(calls, ['CREATE TABLE example (id TEXT);'])
})

test('executeMigrationSql rolls back earlier statements when a later one fails', async () => {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  await assert.rejects(
    () => executeMigrationSql(createSqlJsMigrationDb(db), `
      CREATE TABLE keep_me (id TEXT);
      CREATE TABLE broken (id TEXT,);
    `),
  )
  const tables = db.exec(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'keep_me'`,
  )
  assert.equal(tables.length, 0)
  db.close()
})

test('migrate registers the savings jar auto save migration', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrate.js'), 'utf8')

  assert.match(source, /import migration024 from '@\/core\/db\/migrations\/024_savings_jars_auto_save\.sql\?raw'/)
  assert.match(source, /\{ version: 24, name: 'savings_jars_auto_save', sql: migration024 \}/)
})

test('migrate registers the budget save migration', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrate.js'), 'utf8')

  assert.match(source, /import migration025 from '@\/core\/db\/migrations\/025_budget_save\.sql\?raw'/)
  assert.match(source, /\{ version: 25, name: 'budget_save', sql: migration025 \}/)
})

test('migrate registers the refund origin type migration', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrate.js'), 'utf8')

  assert.match(source, /import migration026 from '@\/core\/db\/migrations\/026_transaction_origin_type_refund\.sql\?raw'/)
  assert.match(source, /\{ version: 26, name: 'transaction_origin_type_refund', sql: migration026 \}/)
})

test('migrate registers the removed invoice carrier cleanup migration', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrate.js'), 'utf8')

  assert.match(source, /import migration031 from '@\/core\/db\/migrations\/031_remove_invoice_carrier\.sql\?raw'/)
  assert.match(source, /\{ version: 31, name: 'remove_invoice_carrier', sql: migration031 \}/)
})

test('migrate registers the reimburse target migration', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrate.js'), 'utf8')

  assert.match(source, /import migration036 from '@\/core\/db\/migrations\/036_transaction_reimburse_target\.sql\?raw'/)
  assert.match(source, /\{ version: 36, name: 'transaction_reimburse_target', sql: migration036 \}/)
})

test('migrate registers the budget pay cycle migration', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrate.js'), 'utf8')

  assert.match(source, /import migration039 from '@\/core\/db\/migrations\/039_budget_pay_cycle\.sql\?raw'/)
  assert.match(source, /\{ version: 39, name: 'budget_pay_cycle', sql: migration039 \}/)
})

test('migrate registers the wear companion migration', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrate.js'), 'utf8')

  assert.match(source, /import migration045 from '@\/core\/db\/migrations\/045_wear_companion\.sql\?raw'/)
  assert.match(source, /\{ version: 45, name: 'wear_companion', sql: migration045 \}/)
})

test('reimburse target migration adds the nullable column to transactions', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../src/core/db/migrations/036_transaction_reimburse_target.sql'),
    'utf8',
  )

  assert.match(source, /ALTER TABLE transactions ADD COLUMN reimburse_target_minor INTEGER;/)
})

test('budget pay cycle migration adds ledger settings and budget period columns', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../src/core/db/migrations/039_budget_pay_cycle.sql'),
    'utf8',
  )

  assert.match(source, /ALTER TABLE ledgers ADD COLUMN budget_period_mode/)
  assert.match(source, /ALTER TABLE ledgers ADD COLUMN budget_pay_day/)
  assert.match(source, /ALTER TABLE budgets ADD COLUMN period_key/)
  assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_period_key/)
})

test('removed invoice carrier cleanup migration drops retired local data', () => {
  const source = readFileSync(
    resolve(import.meta.dirname, '../src/core/db/migrations/031_remove_invoice_carrier.sql'),
    'utf8',
  )

  assert.match(source, /DROP TABLE IF EXISTS invoice_carrier_invoices;/)
  assert.match(source, /DROP TABLE IF EXISTS invoice_carrier_connections;/)
  assert.match(source, /key LIKE 'invoice_carrier\.%'/)
})

test('splitSqlStatements strips MySQL/shell hash comments that SQLite rejects', () => {
  const sql = `
# bad header comment
CREATE TABLE example (id TEXT);
# another hash line
ALTER TABLE example ADD COLUMN note TEXT;
`

  const statements = splitSqlStatements(sql)
  assert.equal(statements.length, 2)
  assert.equal(statements[0], 'CREATE TABLE example (id TEXT);')
  assert.equal(statements[1], 'ALTER TABLE example ADD COLUMN note TEXT;')
  assert.ok(statements.every((statement) => !statement.includes('#')))
})

test('splitSqlStatements keeps hash characters inside quoted string literals', () => {
  const sql = `INSERT INTO notes (body) VALUES ('tag #1');`

  const statements = splitSqlStatements(sql)
  assert.equal(statements.length, 1)
  assert.equal(statements[0], `INSERT INTO notes (body) VALUES ('tag #1');`)
})

test('migrate registers bank sync account checkpoint migration 046', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrate.js'), 'utf8')

  assert.match(source, /import migration046 from '@\/core\/db\/migrations\/046_bank_sync_account_checkpoints\.sql\?raw'/)
  assert.match(source, /\{ version: 46, name: 'bank_sync_account_checkpoints', sql: migration046 \}/)
})

test('migration 046 uses SQLite-safe comments and does not emit hash tokens', () => {
  const migrationPath = resolve(
    import.meta.dirname,
    '../src/core/db/migrations/046_bank_sync_account_checkpoints.sql',
  )
  const sql = readFileSync(migrationPath, 'utf8')

  assert.doesNotMatch(sql, /^\s*#/m)
  assert.match(sql, /^-- Migration 046/m)

  const statements = buildMigrationStatementSet(sql)
  assert.ok(statements.length >= 8)
  assert.ok(statements.every((item) => !/#/.test(item.statement)))
  assert.ok(statements.some((item) => /ALTER TABLE bank_accounts ADD COLUMN last_success_sync_at/.test(item.statement)))
  assert.ok(statements.some((item) => /ALTER TABLE bank_connections ADD COLUMN auto_import_enabled/.test(item.statement)))
})

test('all migration SQL files avoid hash comments that Android sqlite would reject', () => {
  const migrationsDir = resolve(import.meta.dirname, '../src/core/db/migrations')
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()

  assert.ok(files.includes('046_bank_sync_account_checkpoints.sql'))
  assert.ok(files.includes('047_restore_deleted_log_triggers.sql'))

  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8')
    const statements = splitSqlStatements(sql)
    for (const statement of statements) {
      assert.equal(
        statement.includes('#'),
        false,
        `${file} still produces a statement containing '#' for executeSet`,
      )
    }
  }
})

test('executeMigrationSql applies migration 046 on existing bank schema without hash token errors', async () => {
  const SQL = await initSqlJs()
  const db = new SQL.Database()

  db.run(`
    CREATE TABLE bank_connections (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      last_sync_at TEXT,
      deleted_at TEXT,
      PRIMARY KEY (ledger_id, id)
    );
    CREATE TABLE bank_accounts (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      PRIMARY KEY (ledger_id, id)
    );
    CREATE TABLE bank_transactions (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      PRIMARY KEY (ledger_id, id)
    );
  `)

  db.run(
    `INSERT INTO bank_connections (ledger_id, id, last_sync_at, deleted_at)
     VALUES ('L1', 'C1', '2026-08-01T00:00:00Z', NULL);`,
  )
  db.run(
    `INSERT INTO bank_accounts (ledger_id, id, connection_id, enabled, deleted_at)
     VALUES ('L1', 'A1', 'C1', 1, NULL);`,
  )

  const sql = readFileSync(
    resolve(import.meta.dirname, '../src/core/db/migrations/046_bank_sync_account_checkpoints.sql'),
    'utf8',
  )

  const executed = []
  const wrappedDb = {
    async executeSet(items) {
      for (const item of items) {
        executed.push(item.statement)
        if (/#/.test(item.statement)) {
          throw new Error('unrecognized token: "#" (code 1): while compiling: ' + item.statement)
        }
        db.run(item.statement, item.values ?? [])
      }
    },
  }

  await executeMigrationSql(wrappedDb, sql)

  assert.ok(executed.length >= 8)
  assert.ok(executed.every((statement) => !statement.includes('#')))

  const accountCols = tableColumns(db, 'bank_accounts')
  const connectionCols = tableColumns(db, 'bank_connections')
  const txCols = tableColumns(db, 'bank_transactions')
  assert.ok(accountCols.includes('last_success_sync_at'))
  assert.ok(accountCols.includes('sync_cursor'))
  assert.ok(accountCols.includes('last_sync_status'))
  assert.ok(accountCols.includes('last_error'))
  assert.ok(connectionCols.includes('last_attempt_at'))
  assert.ok(connectionCols.includes('last_full_success_at'))
  assert.ok(connectionCols.includes('auto_import_enabled'))
  assert.ok(txCols.includes('identity_scheme'))

  const backfill = db.exec(
    `SELECT last_success_sync_at FROM bank_accounts WHERE ledger_id = 'L1' AND id = 'A1'`,
  )
  assert.equal(backfill[0].values[0][0], '2026-08-01T00:00:00Z')

  // Re-run: duplicate columns are ignorable; user data must remain.
  await executeMigrationSql(createSqlJsMigrationDb(db), sql)
  const again = db.exec(
    `SELECT last_success_sync_at FROM bank_accounts WHERE ledger_id = 'L1' AND id = 'A1'`,
  )
  assert.equal(again[0].values[0][0], '2026-08-01T00:00:00Z')

  db.close()
})

test('migrate registers deleted_log trigger restore migration 047 and posting soft-delete 048', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/core/db/migrate.js'), 'utf8')

  assert.match(source, /import migration047 from '@\/core\/db\/migrations\/047_restore_deleted_log_triggers\.sql\?raw'/)
  assert.match(source, /\{ version: 47, name: 'restore_deleted_log_triggers', sql: migration047 \}/)
  assert.match(source, /import migration048 from '@\/core\/db\/migrations\/048_soft_delete_transaction_postings\.sql\?raw'/)
  assert.match(source, /\{ version: 48, name: 'soft_delete_transaction_postings', sql: migration048 \}/)
  assert.match(source, /assertNoReservedMigrationVersions\(MIGRATIONS\)/)
  assert.match(source, /versions 20, 21, 22, 27 and 29/)
  assert.match(source, /Next available version: 49/)
  assert.doesNotMatch(source, /\{ version: 20,/)
  assert.doesNotMatch(source, /\{ version: 21,/)
  assert.doesNotMatch(source, /\{ version: 22,/)
  assert.doesNotMatch(source, /\{ version: 27,/)
  assert.doesNotMatch(source, /\{ version: 29,/)
})

test('reserved migration versions cannot be re-registered', async () => {
  const {
    RESERVED_MIGRATION_VERSIONS,
    assertNoReservedMigrationVersions,
  } = await import('../src/core/db/reserved-migration-versions.js')

  assert.deepEqual([...RESERVED_MIGRATION_VERSIONS], [20, 21, 22, 27, 29])
  assert.doesNotThrow(() => assertNoReservedMigrationVersions([{ version: 47 }]))
  assert.throws(
    () => assertNoReservedMigrationVersions([{ version: 22, name: 'reuse' }]),
    /Do NOT reuse reserved migration versions 22/,
  )
})

test('migration 047 restores transaction deleted_log trigger and records hard deletes', async () => {
  const SQL = await initSqlJs()
  const db = new SQL.Database()

  db.run(`
    CREATE TABLE deleted_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger_id TEXT NOT NULL,
      table_name TEXT NOT NULL,
      row_pk TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      deleted_at TEXT NOT NULL
    );
    CREATE TABLE transactions (
      ledger_id TEXT,
      id TEXT,
      deleted_at TEXT,
      updated_at TEXT,
      occurred_at TEXT,
      created_at TEXT
    );
    CREATE TABLE transaction_postings (
      ledger_id TEXT,
      id TEXT,
      deleted_at TEXT,
      updated_at TEXT,
      created_at TEXT
    );
    CREATE TABLE budget_save_settlements (
      ledger_id TEXT,
      id TEXT,
      updated_at TEXT,
      created_at TEXT
    );
    CREATE TABLE budget_containers (
      ledger_id TEXT,
      id TEXT,
      updated_at TEXT,
      created_at TEXT
    );
    CREATE TABLE securities (
      ledger_id TEXT,
      id TEXT,
      deleted_at TEXT,
      updated_at TEXT,
      created_at TEXT
    );
    CREATE TABLE security_transactions (
      ledger_id TEXT,
      id TEXT,
      deleted_at TEXT,
      updated_at TEXT,
      occurred_at TEXT,
      created_at TEXT
    );
    CREATE TABLE credit_statements (
      ledger_id TEXT,
      id TEXT,
      deleted_at TEXT,
      updated_at TEXT,
      created_at TEXT
    );
    CREATE TABLE credit_repayments (
      ledger_id TEXT,
      id TEXT,
      deleted_at TEXT,
      updated_at TEXT,
      paid_at TEXT,
      created_at TEXT
    );
    CREATE TABLE credit_repayment_allocations (
      ledger_id TEXT,
      id TEXT,
      deleted_at TEXT,
      updated_at TEXT,
      created_at TEXT
    );
    INSERT INTO transactions (ledger_id, id, created_at)
    VALUES ('L1', 'tx1', '2026-08-01T00:00:00Z');
    INSERT INTO transaction_postings (ledger_id, id, created_at)
    VALUES ('L1', 'p1', '2026-08-01T00:00:00Z');
  `)

  const sql = readFileSync(
    resolve(import.meta.dirname, '../src/core/db/migrations/047_restore_deleted_log_triggers.sql'),
    'utf8',
  )
  await executeMigrationSql(createSqlJsMigrationDb(db), sql)

  const triggerNames = db.exec(
    `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_deleted_log_%' ORDER BY name`,
  )
  const names = triggerNames[0].values.map((row) => String(row[0]))
  assert.ok(names.includes('trg_deleted_log_transactions'))
  assert.ok(names.includes('trg_deleted_log_transaction_postings'))
  assert.equal(names.length, 9)

  db.run(`DELETE FROM transactions WHERE ledger_id = 'L1' AND id = 'tx1'`)
  db.run(`DELETE FROM transaction_postings WHERE ledger_id = 'L1' AND id = 'p1'`)

  const rows = db.exec(
    `SELECT table_name, row_pk FROM deleted_log ORDER BY table_name`,
  )
  assert.deepEqual(rows[0].values, [
    ['transaction_postings', 'p1'],
    ['transactions', 'tx1'],
  ])

  await executeMigrationSql(createSqlJsMigrationDb(db), sql)
  db.close()
})

test('migration 048 soft-deletes postings when parent transaction is soft-deleted', async () => {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run(`
    CREATE TABLE transactions (
      ledger_id TEXT,
      id TEXT,
      deleted_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE transaction_postings (
      ledger_id TEXT,
      id TEXT,
      transaction_id TEXT,
      deleted_at TEXT,
      updated_at TEXT
    );
    INSERT INTO transactions (ledger_id, id, deleted_at, updated_at)
    VALUES ('L1', 'tx1', NULL, '2026-08-01T00:00:00Z');
    INSERT INTO transaction_postings (ledger_id, id, transaction_id, deleted_at, updated_at)
    VALUES ('L1', 'p1', 'tx1', NULL, '2026-08-01T00:00:00Z');
  `)

  const sql = readFileSync(
    resolve(import.meta.dirname, '../src/core/db/migrations/048_soft_delete_transaction_postings.sql'),
    'utf8',
  )
  await executeMigrationSql(createSqlJsMigrationDb(db), sql)

  db.run(`UPDATE transactions SET deleted_at = '2026-08-19T00:00:00Z', updated_at = '2026-08-19T00:00:00Z' WHERE id = 'tx1'`)
  const deleted = db.exec(`SELECT deleted_at FROM transaction_postings WHERE id = 'p1'`)[0].values[0][0]
  assert.equal(deleted, '2026-08-19T00:00:00Z')

  db.run(`UPDATE transactions SET deleted_at = NULL, updated_at = '2026-08-19T01:00:00Z' WHERE id = 'tx1'`)
  const restored = db.exec(`SELECT deleted_at FROM transaction_postings WHERE id = 'p1'`)[0].values[0][0]
  assert.equal(restored, null)
  db.close()
})

