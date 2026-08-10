import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  compareBackupSummaries,
  formatMonthDistributionLabel,
  summarizeBackupJsonText,
  summarizeBackupPayload,
} from '../src/core/services/backup-json-preview.service.js'

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
      { id: 't1', occurred_at: '2026-02-03T10:00:00.000Z', deleted_at: null },
      { id: 't2', occurred_at: '2026-03-01T10:00:00.000Z', deleted_at: null },
      { id: 't3', occurred_at: '2026-04-11T10:00:00.000Z', deleted_at: '2026-04-12T00:00:00.000Z' },
      { id: 't4', occurred_at: '2026-04-20T10:00:00.000Z', deleted_at: null },
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
      { id: 't1', occurred_at: '2026-02-03T10:00:00.000Z', deleted_at: null },
      { id: 't2', occurred_at: '2026-03-01T10:00:00.000Z', deleted_at: null },
    ],
  })))
  const local = summarizeBackupJsonText(JSON.stringify(buildAllLedgersPayload({
    ledgerName: '個人',
    transactions: [
      { id: 't1', occurred_at: '2026-02-03T10:00:00.000Z', deleted_at: null },
      { id: 't2', occurred_at: '2026-03-01T10:00:00.000Z', deleted_at: null },
      { id: 't3', occurred_at: '2026-05-08T10:00:00.000Z', deleted_at: null },
      { id: 't4', occurred_at: '2026-08-01T10:00:00.000Z', deleted_at: null },
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
          transactions: [{ id: 't1', occurred_at: '2026-02-01T00:00:00.000Z', deleted_at: null }],
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
  assert.match(panelSource, /importBackupJsonAsNewLedgers/)
  assert.match(panelSource, /USER_RESTORE_GOOGLE_BACKUP/)
  assert.match(panelSource, /warnIncompleteRemote|warn_incomplete/)
  assert.match(panelSource, /canConfirmRestore/)
  assert.match(dataMgmtSource, /data-testid="data-mgmt-drive-appdata-link"/)
  assert.match(dataMgmtSource, /#drive-appdata-browser/)
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
})

test('smb299: restore orchestration requires importable preview and never wipes on gate failures', async () => {
  const {
    DRIVE_RESTORE_NOT_IMPORTABLE_CODE,
    DRIVE_RESTORE_PREVIEW_REQUIRED_CODE,
    assertBackupJsonImportable,
    assertDriveRestorePreviewReady,
    runConfirmedDriveAppDataRestore,
  } = await import('../src/core/services/drive-appdata-restore.service.js')
  const { RECOVERY_BACKUP_REQUIRED_CODE } = await import('../src/core/services/data-wipe-guard.service.js')

  const goodJson = JSON.stringify(buildAllLedgersPayload({
    ledgerName: '個人',
    transactions: [{ id: 't1', occurred_at: '2026-02-01T00:00:00.000Z', deleted_at: null }],
  }))
  const goodPreview = {
    jsonText: goodJson,
    filename: 'StrawMoneyBook_all_ledgers.json',
    remoteSummary: summarizeBackupJsonText(goodJson),
  }

  assert.equal(assertBackupJsonImportable(goodJson).ok, true)
  assert.equal(assertDriveRestorePreviewReady(goodPreview).jsonText, goodJson)

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
      source: 'unit.success',
    })
    assert.deepEqual(calls, ['download', 'recovery', 'wipe', 'import'])
    assert.equal(result.imported.firstLedgerId, 'new1')
  }
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
  assert.ok(sepIndex > 0, 'history separator --- must exist')
  const pending = notes.slice(0, sepIndex)
  const history = notes.slice(sepIndex + 1)
  assert.doesNotMatch(pending, /^## v\d/m)
  assert.match(history, /^## v\d/m)

  const smb299Gate = /\(smb299\).*runConfirmedDriveAppDataRestore/
  const smb299PreviewGate = /預覽必須成功|importable preview|durable recovery/u
  const inPending = smb299Gate.test(pending) && smb299PreviewGate.test(pending)
  const inHistory = smb299Gate.test(history) && smb299PreviewGate.test(history)
  assert.ok(
    inPending || inHistory,
    'smb299 gate copy must exist in pending (pre-release) or archived ## v* history (post notes:archive)',
  )
  // After notes:archive, pending may be empty; structure must still validate.
  if (inPending) {
    assert.doesNotMatch(pending, /^## v\d/m)
  }

  const { validatePendingNotesStructure } = await import('../scripts/release-notes.mjs')
  const status = validatePendingNotesStructure(notesPath)
  assert.equal(status.ok, true, status.message)
})
