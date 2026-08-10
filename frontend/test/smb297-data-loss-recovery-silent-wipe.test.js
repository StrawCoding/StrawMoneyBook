import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  DATA_WIPE_REASON,
  assertExplicitDataWipe,
  countSnapshotActiveTransactions,
  createEmptyRemoteReplaceBlockedError,
  createLocalDatabaseIntegrityError,
  listDataWipeAudit,
  recordDataWipeAudit,
} from '../src/core/services/data-wipe-guard.service.js'

const bootstrapSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/bootstrap.service.js'),
  'utf8',
)
const sqliteSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/db/sqlite.js'),
  'utf8',
)
const dataMgmtSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsDataManagementPage.vue'),
  'utf8',
)
const autoBackupSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsAutoBackupPage.vue'),
  'utf8',
)
const driveSyncSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/google-drive-ledger-sync.service.js'),
  'utf8',
)
const sharedPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsSharedLedgerPage.vue'),
  'utf8',
)
const repairSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/repair.service.js'),
  'utf8',
)

test('smb297: bootstrap never silent-wipes via resetDatabase', () => {
  assert.doesNotMatch(bootstrapSource, /import\s*\{[^}]*resetDatabase/)
  assert.doesNotMatch(bootstrapSource, /await\s+resetDatabase\s*\(/)
  assert.match(bootstrapSource, /createLocalDatabaseIntegrityError/)
  assert.match(bootstrapSource, /isForeignKeyError/)
  assert.match(bootstrapSource, /NEVER call resetDatabase/i)
})

test('smb297: sqlite init never rebuilds primary DB on schema/FK; resetDatabase requires explicit confirm', () => {
  assert.match(sqliteSource, /assertExplicitDataWipe/)
  assert.match(sqliteSource, /recordDataWipeAudit/)
  assert.match(sqliteSource, /createLocalDatabaseIntegrityError/)
  assert.match(sqliteSource, /function isSchemaShapeError/)
  assert.doesNotMatch(sqliteSource, /isRecoverableSchemaError/)
  assert.doesNotMatch(sqliteSource, /rebuilding local database/)
  assert.doesNotMatch(sqliteSource, /message\.includes\('code 1'\)/)
  assert.match(sqliteSource, /no silent wipe/)
  // plugin-null may open recovery DB name without deleting primary
  assert.match(sqliteSource, /primary untouched/)
})

test('smb297: assertExplicitDataWipe blocks silent / unconfirmed wipe reasons', () => {
  assert.throws(
    () => assertExplicitDataWipe({}),
    (error) => error?.code === 'DATA_WIPE_DENIED' && error?.silentWipeBlocked === true,
  )
  assert.throws(
    () => assertExplicitDataWipe({ confirmed: true, reason: 'bootstrap_schema', source: 'x' }),
    (error) => error?.code === 'DATA_WIPE_DENIED',
  )
  const ok = assertExplicitDataWipe({
    confirmed: true,
    reason: DATA_WIPE_REASON.USER_RESET_ALL,
    source: 'test',
  })
  assert.equal(ok.reason, DATA_WIPE_REASON.USER_RESET_ALL)
})

test('smb297: empty remote replace helper blocks silent wipe semantics', () => {
  const error = createEmptyRemoteReplaceBlockedError({
    localTransactionCount: 12,
    remoteTransactionCount: 0,
  })
  assert.equal(error.code, 'EMPTY_REMOTE_REPLACE_BLOCKED')
  assert.equal(error.silentWipeBlocked, true)
  assert.equal(countSnapshotActiveTransactions({
    tables: {
      transactions: [
        { id: 'a', deleted_at: null },
        { id: 'b', deleted_at: '2026-01-01' },
      ],
    },
  }), 1)
})

test('smb297: data wipe audit records confirmed user wipes', () => {
  const before = listDataWipeAudit().length
  const entry = recordDataWipeAudit({
    reason: DATA_WIPE_REASON.USER_IMPORT_JSON,
    source: 'smb297-test',
    confirmed: true,
    note: 'unit',
  })
  assert.equal(entry.confirmed, true)
  assert.equal(entry.reason, DATA_WIPE_REASON.USER_IMPORT_JSON)
  assert.ok(listDataWipeAudit().length >= before)
})

test('smb297: integrity error is typed and marks silent wipe blocked', () => {
  const error = createLocalDatabaseIntegrityError(new Error('FOREIGN KEY constraint failed (1811)'))
  assert.equal(error.code, 'LOCAL_DB_INTEGRITY')
  assert.equal(error.silentWipeBlocked, true)
  assert.match(error.message, /不會自動清空|will not auto-wipe|自動で帳簿を空に/i)
})

test('smb297: JSON import / reset / restore UX require confirm + recovery backup + wipe reason', () => {
  assert.match(dataMgmtSource, /isImportConfirmOpen/)
  assert.match(dataMgmtSource, /createResetRecoveryBackup/)
  assert.match(dataMgmtSource, /DATA_WIPE_REASON\.USER_IMPORT_JSON/)
  assert.match(dataMgmtSource, /DATA_WIPE_REASON\.USER_RESET_ALL/)
  assert.match(dataMgmtSource, /settings_data\.recovery\.title/)
  assert.match(dataMgmtSource, /confirmed:\s*true/)

  assert.match(autoBackupSource, /openRestoreConfirm/)
  assert.match(autoBackupSource, /createRestoreRecoveryBackup/)
  assert.match(autoBackupSource, /DATA_WIPE_REASON\.USER_RESTORE_GOOGLE_BACKUP/)
  assert.match(autoBackupSource, /DATA_WIPE_REASON\.USER_RESTORE_WEBDAV_BACKUP/)
  assert.match(autoBackupSource, /data-testid="auto-backup-restore-confirm"/)
})

test('smb297: Google Drive sync blocks empty-remote hard replace over local txs', () => {
  assert.match(driveSyncSource, /createEmptyRemoteReplaceBlockedError/)
  assert.match(driveSyncSource, /countSnapshotActiveTransactions/)
  assert.match(driveSyncSource, /EMPTY_REMOTE_REPLACE_BLOCKED/)
  assert.match(driveSyncSource, /empty_remote_blocked/)
  assert.match(driveSyncSource, /allowEmptyRemoteReplace/)
})

test('smb297: shared ledger empty state explains server binding loss ≠ local wipe', () => {
  assert.match(sharedPageSource, /empty_recovery_hint/)
  assert.match(sharedPageSource, /並非本機 silent wipe|not a local silent wipe|silent wipe/)
})

test('smb297: repair path never DELETE FROM transactions as FK shortcut', () => {
  assert.doesNotMatch(repairSource, /DELETE\s+FROM\s+transactions/i)
  assert.match(repairSource, /ensureRepairAccount/)
  assert.match(repairSource, /orphanTxAccountFixed/)
})
