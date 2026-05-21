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
