import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildMigrationStatementSet, executeMigrationSql } from '../src/core/db/migration-executor.js'
import { splitSqlStatements } from '../src/core/db/sql-statements.js'

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

  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0], [{
    statement: 'CREATE TABLE example (id TEXT);',
    values: [],
  }])
  assert.deepEqual(calls[1], [{
    statement: `CREATE TRIGGER IF NOT EXISTS trg_example
    AFTER DELETE ON example
    BEGIN
      INSERT INTO deleted_log (row_pk) VALUES (OLD.id);
    END;`,
    values: [],
  }])
})

test('executeMigrationSql ignores duplicate schema errors when using executeSet', async () => {
  const calls = []
  const db = {
    async executeSet(set) {
      calls.push(set)
      if (calls.length === 1) {
        throw new Error('duplicate column name: example')
      }
      return { changes: { changes: 0 } }
    },
  }

  await executeMigrationSql(db, `
    ALTER TABLE example ADD COLUMN sample TEXT;
    CREATE INDEX idx_example_sample ON example(sample);
  `)

  assert.equal(calls.length, 2)
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
