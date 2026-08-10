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
  assert.match(panelSource, /runConfirmedWipeAfterRecoveryBackup/)
  assert.match(panelSource, /importBackupJsonAsNewLedgers/)
  assert.match(panelSource, /USER_RESTORE_GOOGLE_BACKUP/)
  assert.match(panelSource, /warnIncompleteRemote|warn_incomplete/)
  assert.match(dataMgmtSource, /data-testid="data-mgmt-drive-appdata-link"/)
  assert.match(dataMgmtSource, /#drive-appdata-browser/)
  assert.match(featureListSource, /feature-link-drive-appdata-restore/)
  assert.match(featureListSource, /#drive-appdata-browser/)
})

test('smb299: playwright ui-layout covers Drive appData list / select / revision expand', () => {
  assert.match(playwrightUiLayoutSource, /assertDriveAppDataBrowser/)
  assert.match(playwrightUiLayoutSource, /__SMB_DRIVE_APPDATA_MOCK__/)
  assert.match(playwrightUiLayoutSource, /drive-appdata-file-list/)
  assert.match(playwrightUiLayoutSource, /drive-appdata-revision-list/)
  assert.match(playwrightUiLayoutSource, /feature-link-drive-appdata-restore/)
})
