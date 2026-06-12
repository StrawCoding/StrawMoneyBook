import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/google-drive-ledger-sync.service.js'),
  'utf8',
)

test('Google Drive 帳本同步拉回遠端快照前會驗證 ledger_id，避免錯帳本覆蓋本機資料', () => {
  assert.match(source, /function resolveSnapshotLedgerId\(snapshot\)/)
  assert.match(source, /const requestedLedgerId = String\(ledgerId \?\? ''\)\.trim\(\)/)
  assert.match(source, /if \(snapshotLedgerId !== requestedLedgerId\) \{/)
  assert.match(source, /settings_google_sync\.error\.ledger_mismatch/)
})

test('Google Drive 帳本同步替換本機帳本失敗時會用替換前備份復原', () => {
  assert.match(source, /const localBackupText = existingLedger\s*\? JSON\.stringify\(sanitizeSnapshotForGoogleDriveSync\(await exportLedgerJson\(requestedLedgerId\)\), null, 2\)\s*\: ''/)
  assert.match(source, /try \{\s*if \(existingLedger\) \{\s*await purgeLedger\(requestedLedgerId\)\s*\}/)
  assert.match(source, /catch \(error\) \{\s*if \(localBackupText\) \{\s*await restoreLocalLedgerFromBackup\(requestedLedgerId, localBackupText, existingLedger\)/)
})

test('Google Drive 帳本同步拉回時使用三方合併與 base snapshot，避免直接覆蓋本機未上傳變更', () => {
  assert.match(source, /GOOGLE_LEDGER_SYNC_BASE_SNAPSHOT_KEY/)
  assert.match(source, /threeWayMergeSnapshots/)
  assert.match(source, /function resolvePullSnapshot/)
  assert.match(source, /mergeSharedLedgerSnapshots/)
  assert.match(source, /setBaseSnapshot\(normalizedLedgerId, snapshot\)/)
  assert.match(source, /setBaseSnapshot\(normalizedLedgerId, mergeMeta\.snapshot\)/)
  assert.match(source, /lastConflictCount/)
})

test('Google Drive 帳本同步會偵測 Google 帳號切換、記錄 pending 狀態並阻擋背景靜默推送', () => {
  assert.match(source, /boundEmail: state\.accountEmail/)
  assert.match(source, /switchError\.code = 'GOOGLE_ACCOUNT_SWITCHED'/)
  assert.match(source, /settings_google_sync\.error\.account_switched/)
  assert.match(source, /function recordAccountSwitchMismatch/)
  assert.match(source, /pendingAccountSwitch/)
  assert.match(source, /GOOGLE_LEDGER_SYNC_ACCOUNT_SWITCH_EVENT/)
  assert.match(source, /console\.info\('\[google-ledger-sync\] account switch/)
  assert.match(source, /lastSyncStatus: 'account_mismatch'/)
  assert.match(source, /export async function clearPendingAccountSwitch/)
})

test('Google Drive 帳本同步設定頁會顯示綁定帳號並在帳號切換時要求確認', () => {
  const pageSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/views/settings/SettingsGoogleDriveLedgerSyncPage.vue'),
    'utf8',
  )
  assert.match(pageSource, /settings_google_sync\.bound_account/)
  assert.match(pageSource, /settings_google_sync\.pending_account_switch/)
  assert.match(pageSource, /settings_google_sync\.confirm\.switch_account/)
  assert.match(pageSource, /confirmAccountSwitchRebind/)
  assert.match(pageSource, /clearPendingAccountSwitch/)
  assert.match(pageSource, /GOOGLE_LEDGER_SYNC_ACCOUNT_SWITCH_EVENT/)
})
