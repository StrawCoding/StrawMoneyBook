import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  compareBackupSummaries,
  formatMonthDistributionLabel,
  summarizeBackupJsonText,
  summarizeBackupPayload,
} from '../src/core/services/backup-json-preview.service.js'

const require = createRequire(import.meta.url)
const initSqlJs = require('sql.js')

const driveSource = readFileSync(
  resolve(import.meta.dirname, '../src/services/google/drive-appdata-backup.js'),
  'utf8',
)
const googleBackupSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/google-backup.service.js'),
  'utf8',
)
const autoBackupPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsAutoBackupPage.vue'),
  'utf8',
)
const panelSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/settings/DriveAppDataRestorePanel.vue'),
  'utf8',
)
const dataMgmtSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsDataManagementPage.vue'),
  'utf8',
)
const featureListSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/FeatureListPage.vue'),
  'utf8',
)
const playwrightUiLayoutSource = readFileSync(
  resolve(import.meta.dirname, '../scripts/playwright-ui-layout.mjs'),
  'utf8',
)

function buildValidTransaction(overrides = {}) {
  return {
    id: 't1',
    type: 'expense',
    account_id: 'acc_a',
    amount_minor: 100,
    occurred_at: '2026-02-03T10:00:00.000Z',
    created_at: '2026-02-03T10:00:00.000Z',
    updated_at: '2026-02-03T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

function buildAllLedgersPayload({ ledgerName, transactions }) {
  return {
    schema_version: 1,
    exported_at: '2026-08-10T14:07:00.000Z',
    backup_scope: 'all_ledgers',
    ledgers: [
      {
        ledger_id: 'ledger_a',
        tables: {
          ledgers: [{ id: 'ledger_a', name: ledgerName, deleted_at: null }],
          account_groups: [{
            id: 'ag_a',
            name: '現金',
            type: 'cash',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          }],
          accounts: [{
            id: 'acc_a',
            group_id: 'ag_a',
            name: '錢包',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          }],
          transactions,
        },
      },
    ],
  }
}

test('smb299: backup preview summarizes ledger names, months, and valid tx count', () => {
  const payload = buildAllLedgersPayload({
    ledgerName: '個人',
    transactions: [
      buildValidTransaction({ id: 't1', occurred_at: '2026-02-03T10:00:00.000Z' }),
      buildValidTransaction({ id: 't2', occurred_at: '2026-03-01T10:00:00.000Z' }),
      buildValidTransaction({
        id: 't3',
        occurred_at: '2026-04-11T10:00:00.000Z',
        deleted_at: '2026-04-12T00:00:00.000Z',
      }),
      buildValidTransaction({ id: 't4', occurred_at: '2026-04-20T10:00:00.000Z' }),
    ],
  })
  const summary = summarizeBackupPayload(payload)
  assert.equal(summary.ok, true)
  assert.deepEqual(summary.ledgerNames, ['個人'])
  assert.equal(summary.transactionCount, 3)
  assert.deepEqual(summary.months, ['2026-02', '2026-03', '2026-04'])
  assert.equal(summary.monthDistribution['2026-04'], 1)
  assert.match(formatMonthDistributionLabel(summary.monthDistribution), /2026-02:1/)
})

test('smb299: compareBackupSummaries warns when remote is older or narrower than local', () => {
  const remote = summarizeBackupJsonText(JSON.stringify(buildAllLedgersPayload({
    ledgerName: '個人',
    transactions: [
      buildValidTransaction({ id: 't1', occurred_at: '2026-02-03T10:00:00.000Z' }),
      buildValidTransaction({ id: 't2', occurred_at: '2026-03-01T10:00:00.000Z' }),
    ],
  })))
  const local = summarizeBackupJsonText(JSON.stringify(buildAllLedgersPayload({
    ledgerName: '個人',
    transactions: [
      buildValidTransaction({ id: 't1', occurred_at: '2026-02-03T10:00:00.000Z' }),
      buildValidTransaction({ id: 't2', occurred_at: '2026-03-01T10:00:00.000Z' }),
      buildValidTransaction({ id: 't3', occurred_at: '2026-05-08T10:00:00.000Z' }),
      buildValidTransaction({ id: 't4', occurred_at: '2026-08-01T10:00:00.000Z' }),
    ],
  })))
  const comparison = compareBackupSummaries(remote, local, {
    remoteModifiedAt: '2026-04-01T00:00:00.000Z',
    localModifiedAt: '2026-08-10T14:07:00.000Z',
  })
  assert.equal(comparison.ageRelation, 'older')
  assert.equal(comparison.coverage, 'remote_narrower')
  assert.equal(comparison.warnOlderRemote, true)
  assert.equal(comparison.warnIncompleteRemote, true)
  assert.deepEqual(comparison.monthsOnlyInLocal, ['2026-05', '2026-08'])
})

test('smb299: Drive API lists appData files with pagination and supports revisions download', () => {
  assert.match(driveSource, /listAppDataBackups/)
  assert.match(driveSource, /nextPageToken/)
  assert.match(driveSource, /spaces=appDataFolder/)
  assert.match(driveSource, /listAppDataFileRevisions/)
  assert.match(driveSource, /\/revisions\?fields=/)
  assert.match(driveSource, /revisions\(id,modifiedTime,size,keepForever\)/)
  assert.match(driveSource, /\/revisions\/\$\{encodeURIComponent\(normalizedRevisionId\)\}\?alt=media/)
})

test('smb299: google-backup service exposes list/preview/restore-by-target with mock hook', () => {
  assert.match(googleBackupSource, /listGoogleAppDataFiles/)
  assert.match(googleBackupSource, /listGoogleAppDataFileRevisions/)
  assert.match(googleBackupSource, /previewGoogleAppDataBackup/)
  assert.match(googleBackupSource, /restoreGoogleBackupJsonByTarget/)
  assert.match(googleBackupSource, /__SMB_DRIVE_APPDATA_MOCK__/)
  assert.match(googleBackupSource, /classifyDriveAppDataFile/)
  assert.match(googleBackupSource, /StrawMoneyBook_sync_/)
})

test('smb299: Drive list/revisions/download can be mocked without live Google', async () => {
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const href = String(url)
    calls.push({ href, method: String(init?.method || 'GET') })
    if (href.includes('/revisions/') && href.includes('alt=media')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(buildAllLedgersPayload({
          ledgerName: 'mock-rev',
          transactions: [buildValidTransaction({ id: 't1', occurred_at: '2026-02-01T00:00:00.000Z' })],
        })),
      }
    }
    if (href.includes('/revisions?')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          revisions: [
            { id: 'rev1', modifiedTime: '2026-03-01T00:00:00.000Z', size: '12', keepForever: false },
            { id: 'rev0', modifiedTime: '2026-02-01T00:00:00.000Z', size: '10', keepForever: true },
          ],
        }),
      }
    }
    if (href.includes('spaces=appDataFolder') && !href.includes('alt=media')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          files: [
            { id: 'f1', name: 'StrawMoneyBook_all_ledgers.json', modifiedTime: '2026-08-10T00:00:00.000Z', size: '100' },
            { id: 'f2', name: 'StrawMoneyBook_sync_old.json', modifiedTime: '2026-05-01T00:00:00.000Z', size: '50' },
          ],
        }),
      }
    }
    throw new Error(`unexpected fetch ${href}`)
  }

  try {
    const {
      listAppDataBackups,
      listAppDataFileRevisions,
      downloadAppDataBackupText,
    } = await import('../src/services/google/drive-appdata-backup.js')

    const files = await listAppDataBackups({ accessToken: 'token' })
    assert.equal(files.length, 2)
    assert.equal(files[0].name, 'StrawMoneyBook_all_ledgers.json')

    const revisions = await listAppDataFileRevisions({ accessToken: 'token', fileId: 'f1' })
    assert.equal(revisions[0].id, 'rev1')
    assert.equal(revisions[1].keepForever, true)

    const text = await downloadAppDataBackupText({
      accessToken: 'token',
      fileId: 'f1',
      revisionId: 'rev0',
    })
    assert.match(text, /mock-rev/)
    assert.ok(calls.some((item) => item.href.includes('/revisions/rev0?alt=media')))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('smb299: auto-backup / data-management / advanced expose Drive appData browser entry', () => {
  assert.match(autoBackupPageSource, /DriveAppDataRestorePanel/)
  assert.match(autoBackupPageSource, /drive-appdata-browser|DriveAppDataRestorePanel/)
  // Classic Google/WebDAV restore also gates with formal importer structure before wipe,
  // and uses shared wipe→import + recovery rollback helper.
  assert.match(
    autoBackupPageSource,
    /assertBackupJsonImportable\(backup\?\.jsonText\)[\s\S]*runConfirmedWipeThenImportWithRecoveryRollback/,
  )
  assert.match(panelSource, /data-testid="drive-appdata-browser"/)
  assert.match(panelSource, /data-testid="drive-appdata-file-list"/)
  assert.match(panelSource, /data-testid="drive-appdata-revision-list"/)
  assert.match(panelSource, /data-testid="drive-appdata-restore-confirm"/)
  assert.match(panelSource, /runConfirmedDriveAppDataRestore/)
  assert.match(panelSource, /exportAllLedgersJson/)
  assert.match(panelSource, /saveJsonFileToDevice/)
  assert.match(panelSource, /downloadJsonFile/)
  assert.match(panelSource, /createVerifiedRecoveryBackupBeforeWipe/)
  assert.match(panelSource, /assertDriveRestorePreviewReady|isDriveRestorePreviewReady/)
  assert.match(panelSource, /restoreFromRecovery/)
  assert.match(panelSource, /loadRecoveryBackupJsonText/)
  assert.match(panelSource, /importBackupJsonAsNewLedgers/)
  assert.match(panelSource, /USER_RESTORE_GOOGLE_BACKUP/)
  assert.match(panelSource, /warnIncompleteRemote|warn_incomplete/)
  assert.match(panelSource, /canConfirmRestore/)
  assert.match(dataMgmtSource, /data-testid="data-mgmt-drive-appdata-link"/)
  assert.match(dataMgmtSource, /#drive-appdata-browser/)
  assert.match(
    dataMgmtSource,
    /assertBackupJsonImportable\(text\)[\s\S]*runConfirmedWipeThenImportWithRecoveryRollback/,
  )
  assert.match(
    dataMgmtSource,
    /assertBackupJsonImportable\(loaded\?\.jsonText\)[\s\S]*runConfirmedWipeThenImportWithRecoveryRollback/,
  )
  assert.match(featureListSource, /feature-link-drive-appdata-restore/)
  assert.match(featureListSource, /#drive-appdata-browser/)
})

test('smb299: playwright ui-layout covers Drive appData list / select / revision expand / restore gates', () => {
  assert.match(playwrightUiLayoutSource, /assertDriveAppDataBrowser/)
  assert.match(playwrightUiLayoutSource, /__SMB_DRIVE_APPDATA_MOCK__/)
  assert.match(playwrightUiLayoutSource, /drive-appdata-file-list/)
  assert.match(playwrightUiLayoutSource, /drive-appdata-revision-list/)
  assert.match(playwrightUiLayoutSource, /drive-appdata-restore-confirm/)
  assert.match(playwrightUiLayoutSource, /drive-appdata-restore-confirm-button/)
  assert.match(playwrightUiLayoutSource, /feature-link-drive-appdata-restore/)
  assert.match(playwrightUiLayoutSource, /not_importable|corrupt|drive-appdata-preview-not-importable|restoreConfirmOpened/)
  assert.match(playwrightUiLayoutSource, /file-check-invalid|not_a_valid_type/)
  assert.match(playwrightUiLayoutSource, /sawCountdownGate|confirmDisabled/)
  // Advanced list + fixed BottomNav: scroll center before click; last row must clear nav.
  assert.match(playwrightUiLayoutSource, /scrollIntoView\(\{\s*block:\s*'center'/)
  assert.match(playwrightUiLayoutSource, /clearOfNav/)
})

test('smb299: feature list keeps last advanced rows clear of BottomNav (scroll-margin)', () => {
  assert.match(featureListSource, /scroll-margin-bottom:\s*calc\(88px \+ var\(--navigation-bar-height\)\)/)
})

test('smb299: restore orchestration requires importable preview and never wipes on gate failures', async () => {
  const {
    DRIVE_RESTORE_NOT_IMPORTABLE_CODE,
    DRIVE_RESTORE_PREVIEW_REQUIRED_CODE,
    assertBackupJsonImportable,
    assertDriveRestorePreviewReady,
    runConfirmedDriveAppDataRestore,
  } = await import('../src/core/services/drive-appdata-restore.service.js')
  const { assertBackupJsonStructureImportable } = await import('../src/core/services/backup-json-import-gate.service.js')
  const { RECOVERY_BACKUP_REQUIRED_CODE } = await import('../src/core/services/data-wipe-guard.service.js')

  const goodJson = JSON.stringify(buildAllLedgersPayload({
    ledgerName: '個人',
    transactions: [buildValidTransaction({ id: 't1', occurred_at: '2026-02-01T00:00:00.000Z' })],
  }))
  const goodPreview = {
    jsonText: goodJson,
    filename: 'StrawMoneyBook_all_ledgers.json',
    remoteSummary: summarizeBackupJsonText(goodJson),
  }

  assert.equal(assertBackupJsonImportable(goodJson).ok, true)
  assert.equal(assertBackupJsonStructureImportable(goodJson).mode, 'all_ledgers')
  assert.equal(assertDriveRestorePreviewReady(goodPreview).jsonText, goodJson)

  const poolPayload = buildAllLedgersPayload({
    ledgerName: '個人',
    transactions: [buildValidTransaction({ id: 't_pool', occurred_at: '2026-02-01T00:00:00.000Z' })],
  })
  poolPayload.ledgers[0].tables.budget_containers = [{
    id: 'bc_roll',
    budget_id: 'b1',
    name: '伙食池',
    amount_minor: 30000,
    period_mode: 'daily',
    surplus_mode: 'roll',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }]
  assert.equal(
    assertBackupJsonStructureImportable(JSON.stringify(poolPayload)).mode,
    'all_ledgers',
  )

  await assert.rejects(
    async () => assertBackupJsonImportable('{not-json'),
    (error) => error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE && error?.silentWipeBlocked === true,
  )
  await assert.rejects(
    async () => assertBackupJsonImportable(JSON.stringify({ hello: 'world' })),
    (error) => error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE,
  )
  await assert.rejects(
    async () => assertDriveRestorePreviewReady(null),
    (error) => error?.code === DRIVE_RESTORE_PREVIEW_REQUIRED_CODE && error?.silentWipeBlocked === true,
  )
  await assert.rejects(
    async () => assertDriveRestorePreviewReady({ jsonText: '{bad' }),
    (error) => error?.code === DRIVE_RESTORE_PREVIEW_REQUIRED_CODE,
  )

  // OpenCode tick 13: summary+ledger-id ok, but row has unknown column / missing required fields
  // → must block BEFORE durable recovery / wipe (not after).
  {
    const summaryAndLedgerOkButRowsReject = JSON.stringify({
      backup_scope: 'all_ledgers',
      ledgers: [{
        ledger_id: 'l1',
        tables: {
          ledgers: [{ id: 'l1', name: 'x' }],
          transactions: [{ id: 't1', bogus_column: 'x' }],
        },
      }],
    })
    assert.equal(
      summarizeBackupJsonText(summaryAndLedgerOkButRowsReject).ok,
      true,
      'fixture must still pass summary-only so the row-gate gap is real',
    )
    // Identity-only resolve would pass; row INSERT contract must reject.
    await assert.rejects(
      async () => assertBackupJsonStructureImportable(summaryAndLedgerOkButRowsReject),
      (error) => /不存在的欄位|必要欄位|bogus_column/i.test(String(error?.message ?? '')),
    )
    await assert.rejects(
      async () => assertBackupJsonImportable(summaryAndLedgerOkButRowsReject),
      (error) => error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE && error?.silentWipeBlocked === true,
    )

    let wipeCalled = false
    let imported = false
    let recoveryCalled = false
    let downloadCalled = false
    let rollbackCalled = false
    await assert.rejects(
      async () => runConfirmedDriveAppDataRestore({
        preview: {
          jsonText: summaryAndLedgerOkButRowsReject,
          filename: 'StrawMoneyBook_all_ledgers.json',
          remoteSummary: summarizeBackupJsonText(summaryAndLedgerOkButRowsReject),
        },
        downloadBackup: async () => {
          downloadCalled = true
          return { jsonText: summaryAndLedgerOkButRowsReject }
        },
        createRecoveryBackup: async () => {
          recoveryCalled = true
          return { verified: true, backupId: 'r-row', byteLength: 10, storage: 'test' }
        },
        wipeFn: async () => { wipeCalled = true },
        importBackupJson: async () => { imported = true },
        restoreFromRecovery: async () => { rollbackCalled = true },
        source: 'unit.summary-ok-row-reject-preview',
      }),
      (error) => (
        (error?.code === DRIVE_RESTORE_PREVIEW_REQUIRED_CODE
          || error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE)
        && wipeCalled === false
        && imported === false
        && recoveryCalled === false
        && downloadCalled === false
        && rollbackCalled === false
      ),
    )
    assert.equal(wipeCalled, false)
    assert.equal(recoveryCalled, false)
    assert.equal(downloadCalled, false)

    // Good preview, download returns row-invalid payload → block before recovery/wipe
    wipeCalled = false
    imported = false
    recoveryCalled = false
    await assert.rejects(
      async () => runConfirmedDriveAppDataRestore({
        preview: goodPreview,
        downloadBackup: async () => ({ jsonText: summaryAndLedgerOkButRowsReject }),
        createRecoveryBackup: async () => {
          recoveryCalled = true
          return { verified: true, backupId: 'r-row-dl', byteLength: 10, storage: 'test' }
        },
        wipeFn: async () => { wipeCalled = true },
        importBackupJson: async () => { imported = true },
        restoreFromRecovery: async () => { rollbackCalled = true },
        source: 'unit.summary-ok-row-reject-download',
      }),
      (error) => (
        error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE
        && wipeCalled === false
        && imported === false
        && recoveryCalled === false
      ),
    )
    assert.equal(wipeCalled, false)
    assert.equal(recoveryCalled, false)
  }

  // OpenCode tick 14: complete required fields but CHECK enum violation (type=not_a_valid_type)
  // must be rejected by pre-wipe gate — formal INSERT would fail with SQLite CHECK.
  {
    const checkConstraintReject = JSON.stringify(buildAllLedgersPayload({
      ledgerName: '個人',
      transactions: [
        buildValidTransaction({ id: 't_bad_type', type: 'not_a_valid_type' }),
      ],
    }))
    assert.equal(
      summarizeBackupJsonText(checkConstraintReject).ok,
      true,
      'fixture must pass summary so CHECK-gate gap is real',
    )
    await assert.rejects(
      async () => assertBackupJsonStructureImportable(checkConstraintReject),
      (error) => /不符合約束|not_a_valid_type/i.test(String(error?.message ?? '')),
    )
    await assert.rejects(
      async () => assertBackupJsonImportable(checkConstraintReject),
      (error) => error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE && error?.silentWipeBlocked === true,
    )

    let wipeCalled = false
    let imported = false
    let recoveryCalled = false
    let downloadCalled = false
    await assert.rejects(
      async () => runConfirmedDriveAppDataRestore({
        preview: {
          jsonText: checkConstraintReject,
          filename: 'bad-type.json',
          remoteSummary: summarizeBackupJsonText(checkConstraintReject),
        },
        downloadBackup: async () => {
          downloadCalled = true
          return { jsonText: checkConstraintReject, filename: 'bad-type.json' }
        },
        createRecoveryBackup: async () => {
          recoveryCalled = true
          return { verified: true, backupId: 'r-bad-type', byteLength: 8, storage: 'test' }
        },
        wipeFn: async () => { wipeCalled = true },
        importBackupJson: async () => { imported = true },
        restoreFromRecovery: async () => {},
        source: 'unit.bad-type-check',
      }),
      (error) => (
        (error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE
          || error?.code === DRIVE_RESTORE_PREVIEW_REQUIRED_CODE)
        && wipeCalled === false
        && imported === false
        && recoveryCalled === false
        && downloadCalled === false
      ),
    )
    assert.equal(wipeCalled, false)
    assert.equal(recoveryCalled, false)
  }

  // OpenCode tick 12: summary-ok but formal importer rejects → must block before wipe
  {
    const summaryOkButImporterRejects = JSON.stringify({
      schema_version: 1,
      exported_at: '2026-08-10T14:07:00.000Z',
      backup_scope: 'all_ledgers',
      ledgers: [{}],
    })
    assert.equal(
      summarizeBackupJsonText(summaryOkButImporterRejects).ok,
      true,
      'fixture must still pass summary-only so the gate gap is real',
    )
    await assert.rejects(
      async () => assertBackupJsonStructureImportable(summaryOkButImporterRejects),
      (error) => /ledger_id|ledgers/i.test(String(error?.message ?? '')),
    )
    await assert.rejects(
      async () => assertBackupJsonImportable(summaryOkButImporterRejects),
      (error) => error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE && error?.silentWipeBlocked === true,
    )

    // Preview carrying the bad payload → preview gate blocks; no download/recovery/wipe
    {
      let wipeCalled = false
      let imported = false
      let recoveryCalled = false
      let downloadCalled = false
      const badPreview = {
        jsonText: summaryOkButImporterRejects,
        filename: 'StrawMoneyBook_all_ledgers.json',
        remoteSummary: summarizeBackupJsonText(summaryOkButImporterRejects),
      }
      await assert.rejects(
        async () => runConfirmedDriveAppDataRestore({
          preview: badPreview,
          downloadBackup: async () => {
            downloadCalled = true
            return badPreview
          },
          createRecoveryBackup: async () => {
            recoveryCalled = true
            return {
              verified: true,
              backupId: 'r-structure',
              byteLength: 10,
              storage: 'test',
            }
          },
          wipeFn: async () => { wipeCalled = true },
          importBackupJson: async () => { imported = true },
          source: 'unit.summary-ok-importer-reject-preview',
        }),
        (error) => (
          (error?.code === DRIVE_RESTORE_PREVIEW_REQUIRED_CODE
            || error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE)
          && wipeCalled === false
          && imported === false
          && recoveryCalled === false
          && downloadCalled === false
        ),
      )
      assert.equal(wipeCalled, false)
      assert.equal(imported, false)
      assert.equal(recoveryCalled, false)
      assert.equal(downloadCalled, false)
    }

    // Good preview, download returns summary-ok/importer-reject → block before recovery/wipe
    {
      let wipeCalled = false
      let imported = false
      let recoveryCalled = false
      await assert.rejects(
        async () => runConfirmedDriveAppDataRestore({
          preview: goodPreview,
          downloadBackup: async () => ({ jsonText: summaryOkButImporterRejects }),
          createRecoveryBackup: async () => {
            recoveryCalled = true
            return {
              verified: true,
              backupId: 'r-structure-download',
              byteLength: 10,
              storage: 'test',
            }
          },
          wipeFn: async () => { wipeCalled = true },
          importBackupJson: async () => { imported = true },
          source: 'unit.summary-ok-importer-reject-download',
        }),
        (error) => (
          error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE
          && wipeCalled === false
          && imported === false
          && recoveryCalled === false
        ),
      )
      assert.equal(wipeCalled, false)
      assert.equal(imported, false)
      assert.equal(recoveryCalled, false)
    }
  }

  // tables present (summary ok) but missing ledger_id → no wipe
  {
    const tablesWithoutLedgerId = JSON.stringify({
      tables: {
        transactions: [{ id: 't1', occurred_at: '2026-02-01T00:00:00.000Z', deleted_at: null }],
      },
    })
    assert.equal(summarizeBackupJsonText(tablesWithoutLedgerId).ok, true)
    let wipeCalled = false
    let recoveryCalled = false
    await assert.rejects(
      async () => runConfirmedDriveAppDataRestore({
        preview: goodPreview,
        downloadBackup: async () => ({ jsonText: tablesWithoutLedgerId }),
        createRecoveryBackup: async () => {
          recoveryCalled = true
          return {
            verified: true,
            backupId: 'r-no-ledger',
            byteLength: 10,
            storage: 'test',
          }
        },
        wipeFn: async () => { wipeCalled = true },
        importBackupJson: async () => ({ importedLedgers: [] }),
        source: 'unit.tables-without-ledger-id',
      }),
      (error) => error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE && wipeCalled === false && recoveryCalled === false,
    )
    assert.equal(wipeCalled, false)
    assert.equal(recoveryCalled, false)
  }

  // Missing preview → no wipe
  {
    let wipeCalled = false
    let imported = false
    await assert.rejects(
      async () => runConfirmedDriveAppDataRestore({
        preview: null,
        downloadBackup: async () => goodPreview,
        createRecoveryBackup: async () => ({
          verified: true,
          backupId: 'r1',
          byteLength: 10,
          storage: 'test',
        }),
        wipeFn: async () => { wipeCalled = true },
        importBackupJson: async () => { imported = true },
        source: 'unit.missing-preview',
      }),
      (error) => error?.code === DRIVE_RESTORE_PREVIEW_REQUIRED_CODE && wipeCalled === false && imported === false,
    )
    assert.equal(wipeCalled, false)
  }

  // Download returns non-importable → no wipe
  {
    let wipeCalled = false
    await assert.rejects(
      async () => runConfirmedDriveAppDataRestore({
        preview: goodPreview,
        downloadBackup: async () => ({ jsonText: 'not-a-backup' }),
        createRecoveryBackup: async () => ({
          verified: true,
          backupId: 'r2',
          byteLength: 10,
          storage: 'test',
        }),
        wipeFn: async () => { wipeCalled = true },
        importBackupJson: async () => ({ importedLedgers: [] }),
        source: 'unit.bad-download',
      }),
      (error) => error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE && wipeCalled === false,
    )
    assert.equal(wipeCalled, false)
  }

  // Recovery backup failure → no wipe
  {
    let wipeCalled = false
    await assert.rejects(
      async () => runConfirmedDriveAppDataRestore({
        preview: goodPreview,
        downloadBackup: async () => goodPreview,
        createRecoveryBackup: async () => {
          throw new Error('simulated recovery failure')
        },
        wipeFn: async () => { wipeCalled = true },
        importBackupJson: async () => ({ importedLedgers: [] }),
        source: 'unit.recovery-fail',
      }),
      (error) => error?.code === RECOVERY_BACKUP_REQUIRED_CODE && wipeCalled === false,
    )
    assert.equal(wipeCalled, false)
  }

  // Success path: preview → download → recovery → wipe → import (once each)
  {
    const calls = []
    const result = await runConfirmedDriveAppDataRestore({
      preview: goodPreview,
      downloadBackup: async () => {
        calls.push('download')
        return goodPreview
      },
      createRecoveryBackup: async () => {
        calls.push('recovery')
        return {
          verified: true,
          backupId: 'r3',
          byteLength: 32,
          storage: 'test',
        }
      },
      wipeFn: async () => {
        calls.push('wipe')
      },
      importBackupJson: async (jsonText) => {
        calls.push('import')
        assert.match(jsonText, /個人/)
        return {
          importedLedgers: [{ ledgerId: 'new1', ledgerName: '個人' }],
          firstLedgerId: 'new1',
          firstLedgerName: '個人',
        }
      },
      restoreFromRecovery: async () => {
        calls.push('rollback')
      },
      source: 'unit.success',
    })
    assert.deepEqual(calls, ['download', 'recovery', 'wipe', 'import'])
    assert.equal(result.imported.firstLedgerId, 'new1')
  }

  // Defense in depth: if import throws after wipe, must wipe again (clear partial)
  // THEN restoreFromRecovery — final DB equals wipe-前原狀 (not original+partial).
  {
    const {
      DRIVE_RESTORE_IMPORT_FAILED_RESTORED_CODE,
      runConfirmedWipeThenImportWithRecoveryRollback,
    } = await import('../src/core/services/drive-appdata-restore.service.js')

    const calls = []
    await assert.rejects(
      async () => runConfirmedDriveAppDataRestore({
        preview: goodPreview,
        downloadBackup: async () => {
          calls.push('download')
          return goodPreview
        },
        createRecoveryBackup: async () => {
          calls.push('recovery')
          return {
            verified: true,
            backupId: 'r-rollback',
            byteLength: 32,
            storage: 'test',
          }
        },
        wipeFn: async () => {
          calls.push('wipe')
        },
        importBackupJson: async () => {
          calls.push('import')
          throw new Error('simulated sqlite row constraint')
        },
        restoreFromRecovery: async (proof) => {
          calls.push('rollback')
          assert.equal(proof?.backupId, 'r-rollback')
        },
        source: 'unit.import-fail-after-wipe-rollback',
      }),
      (error) => (
        error?.code === DRIVE_RESTORE_IMPORT_FAILED_RESTORED_CODE
        && error?.localDataRestoredFromRecovery === true
        && error?.silentWipeBlocked === true
      ),
    )
    // Second wipe clears partial import residue before recovery rehydrate.
    assert.deepEqual(calls, ['download', 'recovery', 'wipe', 'import', 'wipe', 'rollback'])

    // Stateful proof: final DB marker equals pre-wipe original, not ORIGINAL+PARTIAL.
    let db = {
      marker: 'ORIGINAL_LOCAL',
      txMonths: ['2026-05', '2026-08'],
      ledgerIds: ['ledger_local'],
    }
    const originalSnapshot = structuredClone(db)
    await assert.rejects(
      async () => runConfirmedWipeThenImportWithRecoveryRollback({
        createRecoveryBackup: async () => ({
          verified: true,
          backupId: 'r-final-state',
          byteLength: 64,
          storage: 'test',
          _snapshot: structuredClone(db),
        }),
        wipeFn: async () => {
          db = { marker: 'EMPTY', txMonths: [], ledgerIds: [] }
        },
        importFn: async () => {
          // Simulate non-atomic multi-step import leaving residue then failing.
          db = {
            marker: 'PARTIAL_CLOUD',
            txMonths: ['2026-02'],
            ledgerIds: ['ledger_cloud_partial'],
          }
          throw new Error('CHECK constraint failed: type')
        },
        restoreFromRecovery: async (proof) => {
          // Helper must have wiped residue first — restore sees EMPTY, not PARTIAL.
          assert.deepEqual(db, { marker: 'EMPTY', txMonths: [], ledgerIds: [] })
          db = structuredClone(proof._snapshot)
        },
        source: 'unit.final-db-equals-prewipe',
      }),
      (error) => (
        error?.code === DRIVE_RESTORE_IMPORT_FAILED_RESTORED_CODE
        && error?.localDataRestoredFromRecovery === true
      ),
    )
    assert.deepEqual(db, originalSnapshot)
    assert.equal(db.marker, 'ORIGINAL_LOCAL')
    assert.deepEqual(db.txMonths, ['2026-05', '2026-08'])
  }
})

test('smb299: sql.js proves CHECK gate + wipe-before-recovery yields wipe-前 DB (not original+partial)', async () => {
  const SQL = await initSqlJs()
  const {
    assertBackupJsonImportable,
    DRIVE_RESTORE_NOT_IMPORTABLE_CODE,
    DRIVE_RESTORE_IMPORT_FAILED_RESTORED_CODE,
    runConfirmedWipeThenImportWithRecoveryRollback,
  } = await import('../src/core/services/drive-appdata-restore.service.js')

  function openRestoreDb() {
    const db = new SQL.Database()
    db.run('PRAGMA foreign_keys = ON;')
    db.run(`
      CREATE TABLE ledgers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE transactions (
        ledger_id TEXT NOT NULL,
        id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('expense','income','adjustment','transfer')),
        amount_minor INTEGER NOT NULL,
        occurred_month TEXT NOT NULL,
        PRIMARY KEY (ledger_id, id),
        FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
      );
    `)
    return db
  }

  function readDbState(db) {
    const ledgers = []
    const ledgerRes = db.exec('SELECT id, name FROM ledgers ORDER BY id;')
    if (ledgerRes[0]) {
      for (const row of ledgerRes[0].values) {
        ledgers.push({ id: row[0], name: row[1] })
      }
    }
    const txs = []
    const txRes = db.exec(
      'SELECT ledger_id, id, type, amount_minor, occurred_month FROM transactions ORDER BY id;',
    )
    if (txRes[0]) {
      for (const row of txRes[0].values) {
        txs.push({
          ledger_id: row[0],
          id: row[1],
          type: row[2],
          amount_minor: row[3],
          occurred_month: row[4],
        })
      }
    }
    return { ledgers, txs }
  }

  function wipeDb(db) {
    db.run('DELETE FROM transactions;')
    db.run('DELETE FROM ledgers;')
  }

  function seedOriginal(db) {
    db.run('INSERT INTO ledgers (id, name) VALUES (?, ?);', ['ledger_local', '本機完整'])
    db.run(
      'INSERT INTO transactions (ledger_id, id, type, amount_minor, occurred_month) VALUES (?, ?, ?, ?, ?);',
      ['ledger_local', 'tx_may', 'expense', 500, '2026-05'],
    )
    db.run(
      'INSERT INTO transactions (ledger_id, id, type, amount_minor, occurred_month) VALUES (?, ?, ?, ?, ?);',
      ['ledger_local', 'tx_aug', 'income', 800, '2026-08'],
    )
  }

  function restoreSnapshot(db, snapshot) {
    wipeDb(db)
    for (const ledger of snapshot.ledgers) {
      db.run('INSERT INTO ledgers (id, name) VALUES (?, ?);', [ledger.id, ledger.name])
    }
    for (const tx of snapshot.txs) {
      db.run(
        'INSERT INTO transactions (ledger_id, id, type, amount_minor, occurred_month) VALUES (?, ?, ?, ?, ?);',
        [tx.ledger_id, tx.id, tx.type, tx.amount_minor, tx.occurred_month],
      )
    }
  }

  // Real SQLite CHECK rejects not_a_valid_type (gate must mirror this before wipe).
  {
    const probe = openRestoreDb()
    probe.run('INSERT INTO ledgers (id, name) VALUES (?, ?);', ['l1', 'x'])
    let checkThrew = false
    try {
      probe.run(
        'INSERT INTO transactions (ledger_id, id, type, amount_minor, occurred_month) VALUES (?, ?, ?, ?, ?);',
        ['l1', 'bad', 'not_a_valid_type', 1, '2026-02'],
      )
    } catch (error) {
      checkThrew = true
      assert.match(String(error?.message ?? error), /CHECK constraint failed/i)
    }
    assert.equal(checkThrew, true)
    probe.close()

    const checkConstraintReject = JSON.stringify(buildAllLedgersPayload({
      ledgerName: '個人',
      transactions: [buildValidTransaction({ id: 't_bad_type', type: 'not_a_valid_type' })],
    }))
    await assert.rejects(
      async () => assertBackupJsonImportable(checkConstraintReject),
      (error) => (
        error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE
        && /not_a_valid_type|不符合約束/i.test(String(error?.message ?? ''))
      ),
    )
  }

  // Orchestrator: wipe → partial committed cloud rows → CHECK fail → wipe residue → restore.
  // Final sql.js DB must equal wipe-前 snapshot (not ORIGINAL+PARTIAL).
  const db = openRestoreDb()
  seedOriginal(db)
  const originalSnapshot = readDbState(db)
  assert.deepEqual(originalSnapshot.txs.map((t) => t.occurred_month).sort(), ['2026-05', '2026-08'])

  await assert.rejects(
    async () => runConfirmedWipeThenImportWithRecoveryRollback({
      createRecoveryBackup: async () => ({
        verified: true,
        backupId: 'r-sqljs-final',
        byteLength: 128,
        storage: 'test',
        _snapshot: structuredClone(originalSnapshot),
      }),
      wipeFn: async () => {
        wipeDb(db)
      },
      importFn: async () => {
        // Simulate non-atomic multi-step import: first ledger/rows commit, later CHECK fails.
        db.run('INSERT INTO ledgers (id, name) VALUES (?, ?);', ['ledger_cloud', '殘缺雲端'])
        db.run(
          'INSERT INTO transactions (ledger_id, id, type, amount_minor, occurred_month) VALUES (?, ?, ?, ?, ?);',
          ['ledger_cloud', 'tx_feb', 'expense', 100, '2026-02'],
        )
        assert.equal(readDbState(db).txs.length, 1)
        // Real CHECK failure path the pre-wipe gate is meant to prevent, but defense-in-depth still rolls back.
        db.run(
          'INSERT INTO transactions (ledger_id, id, type, amount_minor, occurred_month) VALUES (?, ?, ?, ?, ?);',
          ['ledger_cloud', 'tx_bad', 'not_a_valid_type', 1, '2026-03'],
        )
      },
      restoreFromRecovery: async (proof) => {
        // Helper must have wiped residue first — restore must see empty, not partial cloud.
        assert.deepEqual(readDbState(db), { ledgers: [], txs: [] })
        restoreSnapshot(db, proof._snapshot)
      },
      source: 'unit.sqljs-final-db-equals-prewipe',
    }),
    (error) => (
      error?.code === DRIVE_RESTORE_IMPORT_FAILED_RESTORED_CODE
      && error?.localDataRestoredFromRecovery === true
    ),
  )

  assert.deepEqual(readDbState(db), originalSnapshot)
  assert.deepEqual(
    readDbState(db).txs.map((t) => t.id).sort(),
    ['tx_aug', 'tx_may'],
  )
  assert.equal(readDbState(db).txs.some((t) => t.ledger_id === 'ledger_cloud'), false)
  db.close()
})

test('smb299: Drive restore gate shares formal importer structure + row INSERT checks', () => {
  const restoreSource = readFileSync(
    resolve(import.meta.dirname, '../src/core/services/drive-appdata-restore.service.js'),
    'utf8',
  )
  const gateSource = readFileSync(
    resolve(import.meta.dirname, '../src/core/services/backup-json-import-gate.service.js'),
    'utf8',
  )
  const schemaSource = readFileSync(
    resolve(import.meta.dirname, '../src/core/services/backup-json-import-schema.js'),
    'utf8',
  )
  const importSource = readFileSync(
    resolve(import.meta.dirname, '../src/core/services/import.service.js'),
    'utf8',
  )
  assert.match(restoreSource, /assertBackupJsonStructureImportable/)
  assert.match(restoreSource, /runConfirmedWipeThenImportWithRecoveryRollback/)
  assert.match(restoreSource, /restoreFromRecovery/)
  // tick14: clear partial import residue before recovery rehydrate
  assert.match(
    restoreSource,
    /await wipeFn\(\)[\s\S]*await restoreFromRecovery\(recoveryProof\)/,
  )
  assert.match(restoreSource, /partially-committed import residue|partial_clear_failed/)
  assert.match(restoreSource, /MUST wipe again to clear residue/)
  assert.match(gateSource, /resolveSourceLedger/)
  assert.match(gateSource, /assertImportTableRowsInsertable/)
  assert.match(gateSource, /JSON 缺少 ledger_id/)
  assert.match(gateSource, /JSON 缺少可匯入的帳本資料/)
  assert.match(gateSource, /CHECK enum/)
  assert.match(schemaSource, /含不存在的欄位/)
  assert.match(schemaSource, /缺少必要欄位/)
  assert.match(schemaSource, /不符合約束/)
  assert.match(schemaSource, /not_a_valid_type|expense.*income.*adjustment.*transfer|enums/)
  assert.match(schemaSource, /bogus_column|BACKUP_IMPORT_TABLE_SCHEMA/)
  assert.match(schemaSource, /assertRowEnumConstraints/)
  assert.match(importSource, /assertBackupJsonStructureImportable\(jsonText\)/)
  assert.match(importSource, /from '@\/core\/services\/backup-json-import-gate\.service'/)
  assert.match(importSource, /BACKUP_IMPORT_TABLE_ORDER/)
})

test('smb299: DriveAppDataRestorePanel wires durable recovery exporter (not empty options)', () => {
  assert.match(
    panelSource,
    /createVerifiedRecoveryBackupBeforeWipe\(\{[\s\S]*?exportAllLedgersJson[\s\S]*?saveJsonFileToDevice[\s\S]*?downloadJsonFile[\s\S]*?\}\)/,
  )
  assert.doesNotMatch(
    panelSource,
    /createVerifiedRecoveryBackupBeforeWipe\(\{\s*source:[\s\S]*?category: 'auto-backup',\s*\}\)/,
  )
  // Preview must succeed before confirm dialog + countdown; failure closes/never opens confirm.
  assert.match(
    panelSource,
    /assertDriveRestorePreviewReady\(preview\)[\s\S]*?restoreConfirmOpen\.value = true[\s\S]*?startRestoreCountdown\(\)/,
  )
  assert.match(panelSource, /restoreConfirmOpen\.value = false[\s\S]*?uiStore\.pushToast\(pendingPreviewError/)
})

test('smb299: release notes keep smb299 gate copy in pending or archived v* history', async () => {
  const notesPath = resolve(import.meta.dirname, '../../release-notes.pending.md')
  const notes = readFileSync(notesPath, 'utf8')
  const sepIndex = notes.indexOf('\n---\n')
  const pending = sepIndex > 0 ? notes.slice(0, sepIndex) : notes
  const history = sepIndex > 0 ? notes.slice(sepIndex + 1) : ''
  assert.doesNotMatch(pending, /^## v\d/m)
  if (sepIndex > 0) {
    assert.match(history, /^## v\d/m)
  }

  const smb299Gate = /\(smb299\).*runConfirmedDriveAppDataRestore/
  const smb299PreviewGate = /預覽必須成功|importable preview|durable recovery/u
  const inPending = smb299Gate.test(pending) && smb299PreviewGate.test(pending)
  const inHistory = smb299Gate.test(history) && smb299PreviewGate.test(history)

  const { validatePendingNotesStructure } = await import('../scripts/release-notes.mjs')
  const status = validatePendingNotesStructure(notesPath)
  assert.equal(status.ok, true, status.message)

  if (inPending) {
    assert.doesNotMatch(pending, /^## v\d/m)
    return
  }
  if (inHistory) return

  // notes:clear / gpr:minor wipes archived changelog by design. Do not require
  // a manual --- history block (SOP: only gpr archive writes ---). The durable
  // smb299 restore gate lives in product source.
  assert.match(panelSource, /runConfirmedDriveAppDataRestore/)
  assert.match(
    panelSource,
    /assertDriveRestorePreviewReady\(preview\)[\s\S]*?restoreConfirmOpen\.value = true/,
  )
})
