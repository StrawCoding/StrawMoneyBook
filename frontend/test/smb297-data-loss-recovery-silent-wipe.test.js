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
  assert.match(dataMgmtSource, /createVerifiedRecoveryBackupBeforeWipe/)
  assert.match(dataMgmtSource, /runConfirmedWipeAfterRecoveryBackup/)
  assert.match(dataMgmtSource, /DATA_WIPE_REASON\.USER_IMPORT_JSON/)
  assert.match(dataMgmtSource, /DATA_WIPE_REASON\.USER_RESET_ALL/)
  assert.match(dataMgmtSource, /settings_data\.recovery\.title/)
  assert.match(dataMgmtSource, /confirmed:\s*true/)
  // Backup failure must abort — no swallow-then-wipe pattern.
  assert.doesNotMatch(
    dataMgmtSource,
    /failed to create recovery backup before (import wipe|reset)/,
  )
  assert.match(
    dataMgmtSource,
    /runConfirmedWipeAfterRecoveryBackup\(\{[\s\S]*?createRecoveryBackup:\s*createResetRecoveryBackup[\s\S]*?wipeFn:\s*\(\)\s*=>\s*resetDatabase\(\{/,
  )

  assert.match(autoBackupSource, /openRestoreConfirm/)
  assert.match(autoBackupSource, /createRestoreRecoveryBackup/)
  assert.match(autoBackupSource, /createVerifiedRecoveryBackupBeforeWipe/)
  assert.match(autoBackupSource, /runConfirmedWipeAfterRecoveryBackup/)
  assert.match(autoBackupSource, /DATA_WIPE_REASON\.USER_RESTORE_GOOGLE_BACKUP/)
  assert.match(autoBackupSource, /DATA_WIPE_REASON\.USER_RESTORE_WEBDAV_BACKUP/)
  assert.match(autoBackupSource, /data-testid="auto-backup-restore-confirm"/)
  assert.doesNotMatch(
    autoBackupSource,
    /failed to create recovery backup before (webdav|google) restore/,
  )
  assert.match(
    autoBackupSource,
    /runConfirmedWipeAfterRecoveryBackup\(\{[\s\S]*?createRecoveryBackup:\s*createRestoreRecoveryBackup[\s\S]*?wipeFn:\s*\(\)\s*=>\s*resetDatabase\(\{/,
  )
  // Google and WebDAV both use the orchestrated gate (not catch-and-continue).
  assert.equal(
    (autoBackupSource.match(/runConfirmedWipeAfterRecoveryBackup\(/g) || []).length,
    2,
  )
})

test('smb297: recovery backup failure blocks wipe (typed RECOVERY_BACKUP_REQUIRED)', async () => {
  const {
    requireRecoveryBackupBeforeWipe,
    runConfirmedWipeAfterRecoveryBackup,
    createRecoveryBackupRequiredError,
    RECOVERY_BACKUP_REQUIRED_CODE,
  } = await import('../src/core/services/data-wipe-guard.service.js')

  let wipeCalled = false
  await assert.rejects(
    async () => {
      await requireRecoveryBackupBeforeWipe(async () => {
        throw new Error('disk full')
      }, { source: 'smb297-test' })
      wipeCalled = true
    },
    (error) => (
      error?.code === RECOVERY_BACKUP_REQUIRED_CODE
      && error?.silentWipeBlocked === true
      && /中止|not cleared|中止しました/i.test(String(error.message))
    ),
  )
  assert.equal(wipeCalled, false)

  // download-only / void return must NOT unlock wipe
  await assert.rejects(
    async () => {
      await requireRecoveryBackupBeforeWipe(async () => undefined, { source: 'smb297-void' })
    },
    (error) => error?.code === RECOVERY_BACKUP_REQUIRED_CODE && error?.silentWipeBlocked === true,
  )
  await assert.rejects(
    async () => {
      await requireRecoveryBackupBeforeWipe(async () => ({ verified: false }), {
        source: 'smb297-unverified',
      })
    },
    (error) => error?.code === RECOVERY_BACKUP_REQUIRED_CODE,
  )

  const typed = createRecoveryBackupRequiredError(new Error('export failed'), {
    source: 'unit',
  })
  assert.equal(typed.code, RECOVERY_BACKUP_REQUIRED_CODE)
  assert.equal(typed.silentWipeBlocked, true)
})

test('smb297: Google/WebDAV restore orchestration never wipes when recovery backup fails', async () => {
  const { runConfirmedWipeAfterRecoveryBackup, RECOVERY_BACKUP_REQUIRED_CODE } = await import(
    '../src/core/services/data-wipe-guard.service.js'
  )

  for (const source of [
    'SettingsAutoBackupPage.restoreFromGoogle',
    'SettingsAutoBackupPage.restoreFromWebdav',
  ]) {
    let wipeCalled = false
    await assert.rejects(
      async () => runConfirmedWipeAfterRecoveryBackup({
        source,
        i18nKey: 'settings_auto_backup.toast.recovery_backup_required',
        createRecoveryBackup: async () => {
          throw new Error(`simulated recovery backup failure for ${source}`)
        },
        wipeFn: async () => {
          wipeCalled = true
        },
      }),
      (error) => (
        error?.code === RECOVERY_BACKUP_REQUIRED_CODE
        && error?.silentWipeBlocked === true
        && wipeCalled === false
      ),
    )
    assert.equal(wipeCalled, false, `${source} must not wipe after backup failure`)
  }

  // Success path: verified proof then wipe exactly once
  let wipeCount = 0
  await runConfirmedWipeAfterRecoveryBackup({
    source: 'SettingsAutoBackupPage.restoreFromGoogle',
    createRecoveryBackup: async () => ({
      verified: true,
      backupId: 'recovery_ok_1',
      byteLength: 128,
      storage: 'test',
    }),
    wipeFn: async () => {
      wipeCount += 1
      return 'wiped'
    },
  })
  assert.equal(wipeCount, 1)
})

test('smb297: durable recovery backup rejects download-only and verifies persist', async () => {
  const {
    createVerifiedRecoveryBackupBeforeWipe,
    isVerifiedRecoveryBackupProof,
    persistVerifiedRecoveryBackup,
    setRecoveryBackupStorageForTests,
    resetRecoveryBackupStorageForTests,
  } = await import('../src/core/services/recovery-backup.service.js')

  const store = new Map()
  setRecoveryBackupStorageForTests({
    put: async (record) => {
      store.set(record.backupId, record)
    },
    get: async (id) => store.get(id) || null,
  })
  try {
    const proof = await createVerifiedRecoveryBackupBeforeWipe({
      purpose: 'restore',
      source: 'unit',
      exportAllLedgersJson: async () => ({ ledgers: [{ id: 'l1' }], transactions: [{ id: 't1' }] }),
      saveJsonFileToDevice: async () => ({ saved: false, reason: 'not-native' }),
      downloadJsonFile: () => {
        throw new Error('download blocked')
      },
    })
    assert.equal(isVerifiedRecoveryBackupProof(proof), true)
    assert.equal(proof.storage, 'test')
    assert.ok(store.has(proof.backupId))

    await assert.rejects(
      async () => persistVerifiedRecoveryBackup({ purpose: 'x', data: null }),
      /payload missing/,
    )
  } finally {
    resetRecoveryBackupStorageForTests()
  }

  // Fail-closed storage: put succeeds but get cannot verify → must throw
  setRecoveryBackupStorageForTests({
    put: async () => {},
    get: async () => null,
  })
  try {
    await assert.rejects(
      async () => createVerifiedRecoveryBackupBeforeWipe({
        purpose: 'restore',
        exportAllLedgersJson: async () => ({ ok: true }),
        downloadJsonFile: () => {},
      }),
      /verify failed|persist failed|proof invalid/i,
    )
  } finally {
    resetRecoveryBackupStorageForTests()
  }
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

test('smb297: startup integrity is scan-only; FK preserve keeps bookkeeping rows', () => {
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
  assert.match(mergeSource, /synthesizing missing parents|資料保全|preserveSharedLedgerSnapshotForeignKeys/i)
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

test('smb297: sync / shared replace never auto-run integrity repair', () => {
  assert.match(driveSyncSource, /runIntegrityRepair:\s*false/)
  assert.doesNotMatch(driveSyncSource, /runIntegrityRepair:\s*true/)
  const sharedSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/services/shared-ledger.service.js'),
    'utf8',
  )
  assert.match(sharedSource, /runIntegrityRepair:\s*false/)
  assert.doesNotMatch(sharedSource, /runIntegrityRepair:\s*true/)
  const importSource = readFileSync(
    resolve(import.meta.dirname, '../src/core/services/import.service.js'),
    'utf8',
  )
  // repair is opt-in only (=== true), not default-on
  assert.match(importSource, /runIntegrityRepair === true/)
  assert.doesNotMatch(importSource, /runIntegrityRepair !== false/)
})

test('smb297: FK preserve path must not filter-drop related child tables', () => {
  const mergeSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/services/shared-ledger/snapshot-merge.js'),
    'utf8',
  )
  assert.match(mergeSource, /function preserveSharedLedgerSnapshotForeignKeys/)
  assert.doesNotMatch(mergeSource, /function pruneSharedLedgerSnapshotForeignKeys/)
  // Historical silent wipe pattern: filter child rows then increment droppedChildRows.
  assert.doesNotMatch(
    mergeSource,
    /droppedChildRows\s*\+=/,
  )
  assert.doesNotMatch(
    mergeSource,
    /transaction_attachments[\s\S]{0,220}\.filter\(\(row\)\s*=>\s*transactionIds\.has/,
  )
  assert.doesNotMatch(
    mergeSource,
    /loan_payments[\s\S]{0,280}\.filter\(\(row\)\s*=>\s*loanIds\.has/,
  )
  assert.match(mergeSource, /droppedChildRows\s*=\s*0/)
})

test('smb297: import default path leaves integrityCheck null (no silent repair)', async () => {
  // Source contract: repairLedgerData is only reached under runIntegrityRepair === true.
  const importSource = readFileSync(
    resolve(import.meta.dirname, '../src/core/services/import.service.js'),
    'utf8',
  )
  const repairBlock = importSource.match(
    /if \(options\.runIntegrityRepair === true\) \{[\s\S]*?integrityCheck = \{[\s\S]*?\n\s*\}/,
  )
  assert.ok(repairBlock, 'expected opt-in integrity repair block')
  assert.match(repairBlock[0], /repairLedgerData\(/)
  // Outside the opt-in block, integrityCheck stays null (initialized before the if).
  assert.match(importSource, /let integrityCheck = null\s*\n\s*if \(options\.runIntegrityRepair === true\)/)
})

test('smb297: normalize preserves FK associations and related child row counts', async () => {
  const {
    normalizeSharedLedgerSnapshot,
    assertSnapshotBookkeepingPreserved,
  } = await import('../src/ui/services/shared-ledger/snapshot-merge.js')

  const snapshot = {
    schema_version: 18,
    ledger_id: 'ledger_child_preserve',
    tables: {
      ledgers: [{ id: 'ledger_child_preserve', name: 'C' }],
      account_groups: [{ id: 'g1', name: '現金' }],
      accounts: [{ id: 'a1', group_id: 'g1', name: '錢包' }],
      category_groups: [{ id: 'cg1', name: '支出' }],
      categories: [{ id: 'c1', group_id: 'cg1', name: '餐飲' }],
      counterparties: [{ id: 'cp1', name: '友人' }],
      transactions: [
        {
          id: 't1',
          account_id: 'a1',
          category_id: 'c1',
          peer_account_id: null,
          amount_minor: 40,
        },
        {
          id: 't2',
          account_id: 'a1',
          category_id: 'c1',
          peer_account_id: 'a1',
          amount_minor: 60,
        },
      ],
      transaction_attachments: [
        { id: 'att1', transaction_id: 't1', file_uri: 'file://a.jpg' },
      ],
      loans: [{ id: 'loan1', counterparty_id: 'cp1', principal_minor: 1000, status: 'active' }],
      loan_payments: [
        { id: 'lp1', loan_id: 'loan1', account_id: 'a1', amount_minor: 100 },
      ],
      reimbursement_advances: [
        { id: 'adv1', account_id: 'a1', amount_minor: 200 },
      ],
      reimbursement_advance_usages: [
        { id: 'usage1', advance_id: 'adv1', expense_tx_id: 't1', amount_minor: 50 },
      ],
      reimbursements: [{ id: 'rei1', title: '請款', status: 'open', total_minor: 40 }],
      reimbursement_items: [
        {
          id: 'ri1',
          reimbursement_id: 'rei1',
          transaction_id: 't1',
          category_id: 'c1',
          account_id: 'a1',
          amount_minor: 40,
        },
      ],
      budgets: [{ id: 'b1', month_key: '2026-08' }],
      budget_containers: [{ id: 'bc1', budget_id: 'b1', name: '池' }],
      budget_items: [
        {
          id: 'bi1',
          budget_id: 'b1',
          scope_type: 'category',
          category_id: 'c1',
          amount_minor: 500,
        },
      ],
      savings_jars: [{ id: 'jar1', account_id: 'a1', name: '存錢' }],
      bank_connections: [{ id: 'conn1', provider: 'first_bank', display_name: '一銀' }],
      bank_accounts: [
        { id: 'ba1', connection_id: 'conn1', mapped_account_id: 'a1', display_name: '薪轉' },
      ],
      bank_transactions: [
        {
          id: 'bt1',
          connection_id: 'conn1',
          bank_account_id: 'ba1',
          imported_txn_id: 't1',
          amount_minor: 40,
        },
      ],
      bank_sync_rules: [{ id: 'rule1', connection_id: 'conn1', pattern: '薪' }],
    },
  }

  const normalized = normalizeSharedLedgerSnapshot(snapshot)
  const proof = assertSnapshotBookkeepingPreserved(snapshot, normalized)
  assert.equal(proof.preserved, true)
  assert.equal(proof.associationsPreserved, true)
  assert.equal(proof.childCountsPreserved, true)
  assert.equal(proof.after.childCounts.transaction_attachments, 1)
  assert.equal(proof.after.childCounts.loan_payments, 1)
  assert.equal(proof.after.childCounts.reimbursement_items, 1)
  assert.equal(proof.after.childCounts.budget_items, 1)
  assert.equal(proof.after.childCounts.bank_transactions, 1)
  assert.equal(normalized.fk_preserve_report?.droppedChildRows, 0)
  assert.deepEqual(
    proof.after.transactionAssociations.find((row) => row.id === 't1'),
    {
      id: 't1',
      account_id: 'a1',
      category_id: 'c1',
      peer_account_id: null,
      amount_minor: 40,
    },
  )
})

test('smb297: orphan child rows keep counts via parent synthesis (no droppedChildRows)', async () => {
  const { normalizeSharedLedgerSnapshot } = await import(
    '../src/ui/services/shared-ledger/snapshot-merge.js'
  )
  const orphanChildren = {
    schema_version: 1,
    ledger_id: 'ledger_orphan_children',
    tables: {
      ledgers: [{ id: 'ledger_orphan_children', name: 'O' }],
      account_groups: [],
      accounts: [],
      category_groups: [],
      categories: [],
      transactions: [],
      loan_payments: [
        { id: 'lp_orphan', loan_id: 'loan_missing', account_id: 'acc_missing', amount_minor: 10 },
      ],
      savings_jars: [{ id: 'jar_orphan', account_id: 'acc_missing', name: '罐' }],
      budget_items: [
        {
          id: 'bi_orphan',
          budget_id: 'budget_missing',
          scope_type: 'category',
          category_id: 'cat_missing',
          amount_minor: 1,
        },
      ],
      bank_transactions: [
        {
          id: 'bt_orphan',
          connection_id: 'conn_missing',
          bank_account_id: 'ba_missing',
          amount_minor: 1,
        },
      ],
    },
  }
  const normalized = normalizeSharedLedgerSnapshot(orphanChildren)
  assert.equal(normalized.tables.loan_payments.length, 1)
  assert.equal(normalized.tables.savings_jars.length, 1)
  assert.equal(normalized.tables.budget_items.length, 1)
  assert.equal(normalized.tables.bank_transactions.length, 1)
  assert.ok(normalized.tables.accounts.some((row) => row.id === 'acc_missing'))
  assert.ok(normalized.tables.loans.some((row) => row.id === 'loan_missing'))
  assert.ok(normalized.tables.budgets.some((row) => row.id === 'budget_missing'))
  assert.ok(normalized.tables.bank_connections.some((row) => row.id === 'conn_missing'))
  assert.equal(normalized.fk_preserve_report?.droppedChildRows, 0)
})
