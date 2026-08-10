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
  assert.match(repairSource, /assertExplicitLedgerRepair/)
})

test('smb297: startup integrity is scan-only; prune preserves bookkeeping rows', () => {
  const runtimeSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/services/ledger-runtime.service.js'),
    'utf8',
  )
  const mergeSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/services/shared-ledger/snapshot-merge.js'),
    'utf8',
  )
  assert.doesNotMatch(runtimeSource, /repairLedgerData\(/)
  assert.match(runtimeSource, /scanLedgerIntegrity/)
  assert.match(runtimeSource, /recordLedgerIntegrityScan/)
  assert.match(mergeSource, /synthesizing missing parents|資料保全/i)
  assert.match(mergeSource, /assertSnapshotBookkeepingPreserved/)
  assert.match(mergeSource, /fk_preserve_report/)
})

test('smb297: healthy snapshot survives normalize with identical bookkeeping', async () => {
  const {
    normalizeSharedLedgerSnapshot,
    assertSnapshotBookkeepingPreserved,
  } = await import('../src/ui/services/shared-ledger/snapshot-merge.js')

  const snapshot = {
    schema_version: 18,
    ledger_id: 'ledger_smb297',
    tables: {
      ledgers: [{ id: 'ledger_smb297', name: 'SMB297' }],
      account_groups: [{ id: 'g1', name: '現金' }],
      accounts: [{ id: 'a1', group_id: 'g1', name: '錢包' }],
      category_groups: [{ id: 'cg1', name: '支出' }],
      categories: [{ id: 'c1', group_id: 'cg1', name: '餐飲' }],
      transactions: [
        { id: 't1', account_id: 'a1', category_id: 'c1', amount_minor: 50 },
        { id: 't2', account_id: 'a1', category_id: 'c1', amount_minor: 150 },
      ],
    },
  }
  const normalized = normalizeSharedLedgerSnapshot(snapshot)
  const proof = assertSnapshotBookkeepingPreserved(snapshot, normalized)
  assert.equal(proof.preserved, true)
  assert.equal(proof.after.amountMinorTotal, 200)
  assert.deepEqual(proof.after.transactionIds, ['t1', 't2'])
})

test('smb297: orphan parents are synthesized — transactions are not dropped', async () => {
  const { normalizeSharedLedgerSnapshot } = await import('../src/ui/services/shared-ledger/snapshot-merge.js')
  const orphan = {
    schema_version: 1,
    ledger_id: 'ledger_orphan',
    tables: {
      ledgers: [{ id: 'ledger_orphan', name: 'O' }],
      account_groups: [],
      accounts: [{ id: 'acc_x', group_id: 'missing_group', name: 'X' }],
      category_groups: [],
      categories: [],
      transactions: [{ id: 'tx1', account_id: 'acc_x', amount_minor: 99 }],
    },
  }
  const normalized = normalizeSharedLedgerSnapshot(orphan)
  assert.equal(normalized.tables.transactions.length, 1)
  assert.equal(normalized.tables.transactions[0].amount_minor, 99)
  assert.equal(normalized.tables.accounts.length, 1)
  assert.ok(normalized.tables.account_groups.some((row) => row.id === 'missing_group'))
})

test('smb297: explicit repair required; unconfirmed repair denied', async () => {
  const { assertExplicitLedgerRepair, LEDGER_REPAIR_REASON } = await import(
    '../src/core/services/data-wipe-guard.service.js'
  )
  assert.throws(
    () => assertExplicitLedgerRepair({}),
    (error) => error?.code === 'LEDGER_REPAIR_DENIED' && error?.silentRewriteBlocked === true,
  )
  const ok = assertExplicitLedgerRepair({
    confirmed: true,
    reason: LEDGER_REPAIR_REASON.USER_EXPLICIT,
    source: 'test',
  })
  assert.equal(ok.reason, LEDGER_REPAIR_REASON.USER_EXPLICIT)
})

test('smb297: data management exposes explicit integrity repair UX', () => {
  assert.match(dataMgmtSource, /data-integrity-panel/)
  assert.match(dataMgmtSource, /LEDGER_REPAIR_REASON\.USER_EXPLICIT/)
  assert.match(dataMgmtSource, /integrity-repair-confirm/)
  assert.match(dataMgmtSource, /repairLedgerData/)
})
