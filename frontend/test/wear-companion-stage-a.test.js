import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'

import { executeMigrationSql } from '../src/core/db/migration-executor.js'
import {
  isWearMessagePath,
  maySendWearPayload,
  parseWearEnvelope,
  shouldApplySnapshot,
  validateTxCreatePayload,
  wearExternalRefId,
  WEAR_PATHS,
} from '../src/core/services/wear-protocol.js'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js')

const frontendRoot = resolve(import.meta.dirname, '..')

function listFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'build' || name === '.gradle') continue
      listFiles(full, out)
      continue
    }
    out.push(full)
  }
  return out
}

function createSqlJsMigrationDb(rawDb) {
  return {
    async executeSet(items) {
      for (const item of items) {
        rawDb.run(item.statement, item.values ?? [])
      }
    },
  }
}

test('wear protocol nearby-first and path whitelist', () => {
  assert.equal(maySendWearPayload(true), true)
  assert.equal(maySendWearPayload(false), false)
  assert.equal(maySendWearPayload(undefined), false)
  assert.equal(isWearMessagePath(WEAR_PATHS.txCreate), true)
  assert.equal(isWearMessagePath('/smb/v1/tx/unknown'), false)
  assert.equal(wearExternalRefId('  abc  '), 'wear:abc')
})

test('wear snapshot epoch poisoning accepts a different epoch even with a lower revision', () => {
  assert.equal(shouldApplySnapshot({ syncEpoch: 'aaa', snapshotRevision: 9 }, { syncEpoch: 'bbb', snapshotRevision: 1 }), true)
  assert.equal(shouldApplySnapshot({ syncEpoch: 'aaa', snapshotRevision: 9 }, { syncEpoch: 'aaa', snapshotRevision: 9 }), false)
  assert.equal(shouldApplySnapshot({ syncEpoch: 'aaa', snapshotRevision: 9 }, { syncEpoch: 'aaa', snapshotRevision: 10 }), true)
  assert.equal(shouldApplySnapshot({ syncEpoch: 'aaa', snapshotRevision: 9 }, { syncEpoch: '', snapshotRevision: 99 }), false)
})

test('wear tx.create payload rejects transfer and requires idempotencyKey', () => {
  assert.throws(() => validateTxCreatePayload({
    idempotencyKey: 'k1',
    ledgerId: 'l1',
    type: 'transfer',
    accountId: 'a1',
    categoryId: 'c1',
    amountMinor: 100,
    catalogRevision: 1,
  }), /type must be expense or income/)
  assert.throws(() => validateTxCreatePayload({
    ledgerId: 'l1',
    type: 'expense',
    accountId: 'a1',
    categoryId: 'c1',
    amountMinor: 100,
    catalogRevision: 1,
  }), /idempotencyKey/)
  const parsed = validateTxCreatePayload({
    idempotencyKey: 'k1',
    clientTxId: 'room-pk-only',
    ledgerId: 'l1',
    type: 'expense',
    accountId: 'a1',
    categoryId: 'c1',
    amountMinor: 2500,
    catalogRevision: 3,
    note: 'x'.repeat(250),
  })
  assert.equal(parsed.clientTxId, 'room-pk-only')
  assert.equal(parsed.note.length, 200)
  assert.equal(parseWearEnvelope({ protocolVersion: 1, msg: 'hello' }).msg, 'hello')
  assert.throws(() => parseWearEnvelope({ protocolVersion: 2 }), /protocolVersion/)
})

test('migrate registers wear companion migration 045', () => {
  const source = readFileSync(resolve(frontendRoot, 'src/core/db/migrate.js'), 'utf8')
  assert.match(source, /import migration045 from '@\/core\/db\/migrations\/045_wear_companion\.sql\?raw'/)
  assert.match(source, /\{ version: 45, name: 'wear_companion', sql: migration045 \}/)
})

test('wear companion source: origin wear, native engine, no DataClient/wearApp', () => {
  const wearTx = readFileSync(resolve(frontendRoot, 'src/core/services/wear-transaction.service.js'), 'utf8')
  const credit = readFileSync(resolve(frontendRoot, 'src/core/services/credit.service.js'), 'utf8')
  const transactionService = readFileSync(resolve(frontendRoot, 'src/core/services/transaction.service.js'), 'utf8')
  const transactionRepo = readFileSync(resolve(frontendRoot, 'src/core/repositories/transaction.repo.js'), 'utf8')
  const sqlite = readFileSync(resolve(frontendRoot, 'src/core/db/sqlite.js'), 'utf8')
  const deleteOrder = readFileSync(resolve(frontendRoot, 'src/core/utils/sqlite-delete-order.js'), 'utf8')
  const migration045 = readFileSync(resolve(frontendRoot, 'src/core/db/migrations/045_wear_companion.sql'), 'utf8')
  const gradle = readFileSync(resolve(frontendRoot, 'android/app/build.gradle'), 'utf8')
  const settingsGradle = readFileSync(resolve(frontendRoot, 'android/settings.gradle'), 'utf8')

  assert.match(wearTx, /originType: 'wear'/)
  assert.match(wearTx, /INSERT INTO wear_applied/)
  assert.match(wearTx, /WearCompanion\.applyTxCreate/)
  assert.match(wearTx, /status: 'schema_upgrade_required'/)
  assert.match(credit, /originType: payload\.originType \?\? 'manual'/)
  assert.match(credit, /externalRefId: payload\.externalRefId \?\? null/)
  assert.match(transactionService, /originType: payload\.originType \?\? 'manual'/)
  assert.match(
    transactionRepo,
    /idempotency_key = CASE WHEN origin_type = 'wear' THEN idempotency_key ELSE NULL END/,
  )
  assert.match(sqlite, /rotateWearSyncEpoch/)
  assert.match(deleteOrder, /'wear_applied'/)
  assert.match(deleteOrder, /'wear_sync_state'/)
  assert.match(migration045, /origin_type IN \('manual','loan_payment','reimbursement','import','recurring','refund','wear'\)/)
  assert.match(migration045, /CREATE TABLE IF NOT EXISTS wear_applied/)
  assert.match(migration045, /CREATE TABLE IF NOT EXISTS wear_sync_state/)
  assert.match(migration045, /trg_wear_rev_tx_ai/)
  assert.doesNotMatch(gradle, /wearApp/)
  assert.doesNotMatch(settingsGradle, /wearApp/)

  const androidJavaRoot = resolve(frontendRoot, 'android/app/src/main/java')
  const offenders = []
  for (const file of listFiles(androidJavaRoot)) {
    if (!file.endsWith('.java')) continue
    const text = readFileSync(file, 'utf8')
    if (/PutDataRequest|DataClient|wearApp\s+project/.test(text)) offenders.push(file)
    if (file.includes('/wear/') && /android\.database\.sqlite\.SQLiteDatabase\.openDatabase/.test(text)) {
      offenders.push(file)
    }
  }
  assert.deepEqual(offenders, [], `forbidden Data Layer / wearApp / openDatabase: ${offenders.join(', ')}`)

  const constants = readFileSync(
    resolve(androidJavaRoot, 'com/strawcoding/strawmoneybook/wear/WearCompanionConstants.java'),
    'utf8',
  )
  const engine = readFileSync(
    resolve(androidJavaRoot, 'com/strawcoding/strawmoneybook/wear/WearTransactionEngine.java'),
    'utf8',
  )
  const listener = readFileSync(
    resolve(androidJavaRoot, 'com/strawcoding/strawmoneybook/wear/WearCompanionListenerService.java'),
    'utf8',
  )
  const repo = readFileSync(
    resolve(androidJavaRoot, 'com/strawcoding/strawmoneybook/wear/AndroidDbRepository.java'),
    'utf8',
  )
  assert.match(constants, /straw_money_bookSQLite\.db/)
  assert.match(constants, /no-encryption/)
  assert.match(engine, /applyTxCreate/)
  assert.match(engine, /'wear'/)
  assert.match(listener, /extends WearableListenerService/)
  assert.match(listener, /isNearby/)
  assert.match(listener, /PATH_TX_CREATE/)
  assert.doesNotMatch(listener, /PutDataMapRequest|DataClient/)
  assert.match(repo, /WearCompanionConstants\.SQLITE_FILE_NAME/)
  assert.match(repo, /com\.getcapacitor\.community\.database\.sqlite\.SQLite\.Database/)
  assert.doesNotMatch(repo, /android\.database\.sqlite\.SQLiteDatabase\.openDatabase/)
})

test('migration 045 rebuilds origin_type wear, UNIQUE wear_applied, and syncEpoch', async () => {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON;')
  db.run(`
    CREATE TABLE ledgers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT '2020-01-01T00:00:00.000Z',
      updated_at TEXT NOT NULL DEFAULT '2020-01-01T00:00:00.000Z',
      deleted_at TEXT
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
    CREATE TABLE transactions (
      ledger_id TEXT NOT NULL,
      id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('expense','income','adjustment','transfer')),
      transfer_group_id TEXT,
      account_id TEXT NOT NULL,
      peer_account_id TEXT,
      category_id TEXT,
      amount_minor INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      note TEXT,
      location TEXT,
      tags_json TEXT,
      origin_type TEXT NOT NULL DEFAULT 'manual' CHECK (origin_type IN ('manual','loan_payment','reimbursement','import','recurring','refund')),
      external_ref_id TEXT,
      idempotency_key TEXT,
      include_in_budget INTEGER NOT NULL DEFAULT 1,
      include_in_analysis INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      is_reimbursable INTEGER NOT NULL DEFAULT 0,
      reimbursement_state TEXT NOT NULL DEFAULT 'none',
      reimbursed_at TEXT,
      reimburse_target_minor INTEGER,
      created_by_user_id TEXT,
      created_by_display_name TEXT,
      updated_by_user_id TEXT,
      updated_by_display_name TEXT,
      posted_at TEXT,
      PRIMARY KEY (ledger_id, id),
      FOREIGN KEY (ledger_id, account_id) REFERENCES accounts(ledger_id, id) ON DELETE RESTRICT,
      FOREIGN KEY (ledger_id, category_id) REFERENCES categories(ledger_id, id) ON DELETE RESTRICT
    );
    CREATE TABLE transaction_attachments (id TEXT);
    CREATE TABLE transaction_postings (id TEXT);
    CREATE TABLE reimbursement_advance_usages (id TEXT);
    CREATE TABLE loan_payments (ledger_id TEXT, id TEXT, generated_tx_id TEXT);
    CREATE TABLE reimbursements (ledger_id TEXT, id TEXT, paid_tx_id TEXT);
    CREATE TABLE reimbursement_items (ledger_id TEXT, id TEXT, transaction_id TEXT);
    CREATE TABLE bank_transactions (ledger_id TEXT, id TEXT, imported_txn_id TEXT);
    CREATE TABLE reimbursement_advances (ledger_id TEXT, id TEXT, source_tx_id TEXT);
  `)
  db.run(`INSERT INTO ledgers (id, name) VALUES ('led1', 'Main');`)
  db.run(`INSERT INTO accounts (ledger_id, id, name) VALUES ('led1', 'acc1', 'Cash');`)
  db.run(`INSERT INTO categories (ledger_id, id, name) VALUES ('led1', 'cat1', 'Food');`)
  db.run(`
    INSERT INTO transactions (
      ledger_id, id, type, account_id, category_id, amount_minor, occurred_at,
      origin_type, created_at, updated_at, posted_at
    ) VALUES (
      'led1', 'tx1', 'expense', 'acc1', 'cat1', -100,
      '2026-08-01T00:00:00.000Z', 'manual',
      '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
    );
  `)

  const sql = readFileSync(
    resolve(frontendRoot, 'src/core/db/migrations/045_wear_companion.sql'),
    'utf8',
  )
  await executeMigrationSql(createSqlJsMigrationDb(db), sql)

  const epoch = db.exec('SELECT sync_epoch FROM wear_sync_state WHERE id = 1;')[0].values[0][0]
  assert.equal(typeof epoch, 'string')
  assert.ok(String(epoch).length >= 16)

  db.run(`
    INSERT INTO transactions (
      ledger_id, id, type, account_id, category_id, amount_minor, occurred_at,
      origin_type, idempotency_key, created_at, updated_at, posted_at
    ) VALUES (
      'led1', 'tx-wear', 'expense', 'acc1', 'cat1', -2500,
      '2026-08-14T00:00:00.000Z', 'wear', 'idem-1',
      '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z'
    );
  `)
  db.run(`INSERT INTO wear_applied (idempotency_key, ledger_id, tx_id, applied_at)
          VALUES ('idem-1', 'led1', 'tx-wear', '2026-08-14T00:00:00.000Z');`)

  assert.throws(() => {
    db.run(`INSERT INTO wear_applied (idempotency_key, ledger_id, tx_id, applied_at)
            VALUES ('idem-1', 'led1', 'tx-wear-dup', '2026-08-14T00:00:01.000Z');`)
  })
  assert.throws(() => {
    db.run(`
      INSERT INTO transactions (
        ledger_id, id, type, account_id, category_id, amount_minor, occurred_at,
        origin_type, created_at, updated_at
      ) VALUES (
        'led1', 'tx-bad', 'expense', 'acc1', 'cat1', -1,
        '2026-08-14T00:00:00.000Z', 'watch',
        '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z'
      );
    `)
  })

  const revision = db.exec('SELECT snapshot_revision FROM wear_sync_state WHERE id = 1;')[0].values[0][0]
  assert.ok(Number(revision) >= 1, 'transaction insert must bump snapshot_revision')

  db.run(`UPDATE transactions SET deleted_at = '2026-08-14T01:00:00.000Z',
          idempotency_key = CASE WHEN origin_type = 'wear' THEN idempotency_key ELSE NULL END
          WHERE id = 'tx-wear';`)
  const kept = db.exec(`SELECT idempotency_key FROM transactions WHERE id = 'tx-wear';`)[0].values[0][0]
  assert.equal(kept, 'idem-1')

  db.close()
})

test('backup export/import keep wear origin and wear_applied', () => {
  const schema = readFileSync(resolve(frontendRoot, 'src/core/services/backup-json-import-schema.js'), 'utf8')
  const exportService = readFileSync(resolve(frontendRoot, 'src/core/services/export.service.js'), 'utf8')
  assert.match(schema, /'wear'/)
  assert.match(schema, /wear_applied:/)
  assert.match(schema, /'wear_applied'/)
  assert.match(exportService, /'wear_applied'/)
  assert.doesNotMatch(schema, /wear_sync_state/)
})
