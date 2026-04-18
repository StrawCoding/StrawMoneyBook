import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mainSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/app-runtime.service.js'),
  'utf8',
)

test('runtime service schedules recurring due checks for automatic backups', () => {
  assert.match(mainSource, /const AUTO_BACKUP_DUE_CHECK_MS = 5 \* 60 \* 1000/)
  assert.match(mainSource, /function scheduleAutoBackupDueCheck\(runtimeState, pinia, windowObject = globalThis\.window, delayMs = AUTO_BACKUP_DUE_CHECK_MS\)/)
  assert.match(mainSource, /runtimeState\.autoBackupDueTimer = windowObject\.setTimeout\(\(\) => \{/)
  assert.match(mainSource, /async function runAutoBackupDueCheck\(runtimeState, pinia, windowObject, reason = 'scheduled_due_check'\)/)
  assert.match(mainSource, /Promise\.allSettled\(\[\s*runGoogleAutoBackupIfDue\(ledgerId\),\s*runWebdavAutoBackupIfDue\(ledgerId\),\s*\]\)/)
  assert.match(mainSource, /scheduleAutoBackupDueCheck\(runtimeState, pinia, windowObject\)/)
})

test('backup due scheduler is refreshed on app resume, data changes, and ledger switches', () => {
  assert.match(mainSource, /scheduleAutoBackupDueCheck\(runtimeState, pinia, windowObject\)\s*\n\s*}\s*\n\s*void runSharedLedgerBackgroundSyncNow/s)
  assert.match(mainSource, /scheduleAutoBackupDueCheck\(runtimeState, pinia, windowObject, 30000\)/)
  assert.match(mainSource, /clearAutoBackupDueTimer\(runtimeState, windowObject\)\s*\n\s*return\s*\n\s*}\s*\n\s*restoreGoogleBackupForActiveLedgerInBackground/s)
})

test('backup due scheduler reruns immediately after backup configuration updates', () => {
  assert.match(mainSource, /addWindowListener\('app:auto-backup-config-updated', \(\) => \{\s*void runAutoBackupDueCheck\(runtimeState, pinia, windowObject, 'config_updated'\)/)
})
