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
