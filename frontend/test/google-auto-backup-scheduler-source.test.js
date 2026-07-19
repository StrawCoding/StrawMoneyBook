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
  assert.match(mainSource, /const results = await runAutoBackupProvidersIfDue\(ledgerId\)/)
  assert.match(mainSource, /googleResult: results\.find\(\(result\) => result\?\.provider === 'google'\) \?\? null/)
  assert.match(mainSource, /webdavResult: results\.find\(\(result\) => result\?\.provider === 'webdav'\) \?\? null/)
  assert.match(mainSource, /scheduleAutoBackupDueCheck\(runtimeState, pinia, windowObject\)/)
})

test('backup due scheduler is refreshed on app resume, data changes, and ledger switches', () => {
  assert.match(
    mainSource,
    /scheduleAutoBackupDueCheck\(runtimeState, pinia, windowObject\)\s*\n\s*}\s*\n\s*void syncActiveLedgerHomeWidget\(pinia\)/s,
  )
  assert.match(
    mainSource,
    /restoreSharedLedgerSessionInBackground\('app_resume'\)\.finally\(\(\) => \{\s*void runSharedLedgerBackgroundSyncNow\(pinia\)/s,
  )
  assert.match(mainSource, /scheduleAutoBackupDueCheck\(runtimeState, pinia, windowObject, 30000\)/)
  assert.match(mainSource, /clearAutoBackupDueTimer\(runtimeState, windowObject\)\s*\n\s*return\s*\n\s*}\s*\n\s*restoreGoogleBackupForActiveLedgerInBackground/s)
  assert.match(mainSource, /restoreGoogleBackupForActiveLedgerInBackground\(runtimeState, normalizedLedgerId, \{\s*runDueBackup: true,\s*allowInteractive: false,/)
})

test('backup due scheduler reruns immediately after backup configuration updates', () => {
  assert.match(mainSource, /addWindowListener\('app:auto-backup-config-updated', \(\) => \{\s*void runAutoBackupDueCheck\(runtimeState, pinia, windowObject, 'config_updated'\)/)
})

test('background auto backup runs notify the UI to refresh persisted diagnostics', () => {
  assert.match(mainSource, /const AUTO_BACKUP_STATE_UPDATED_EVENT = 'app:auto-backup-state-updated'/)
  assert.match(mainSource, /function notifyAutoBackupStateUpdated\(windowObject, result = \{\}\) \{/)
  assert.match(mainSource, /provider: String\(result\?\.provider/)
  assert.match(mainSource, /mode: String\(result\?\.mode/)
  assert.match(mainSource, /status: String\(result\?\.status/)
  assert.match(mainSource, /checkedAt: String\(result\?\.checkedAt/)
  assert.match(mainSource, /windowObject\.dispatchEvent\(new CustomEvent\(AUTO_BACKUP_STATE_UPDATED_EVENT, \{/)
  assert.match(mainSource, /notifyAutoBackupRunResults\(windowObject, ledgerId, results/)
  assert.match(mainSource, /runAutoBackupProvidersOnDataChange\(ledgerId\)/)
  assert.match(mainSource, /reason: 'data_change_background_check_completed'/)
  assert.match(mainSource, /notifyAutoBackupRunResults\(globalThis\.window, ledgerId, \[result\]/)
  assert.match(mainSource, /reason: 'google_restore_due_check_completed'/)
})

test('google restore path still runs due diagnostics when silent restore cannot connect', () => {
  assert.match(
    mainSource,
    /await restoreGoogleBackupSessionInBackground\(runtimeState, ledgerId, \{ allowInteractive }\)\s*if \(!runDueBackup\) return\s*const result = await runAutoBackupProvider\(ledgerId, 'google', 'due'\)/s,
  )
  assert.doesNotMatch(mainSource, /if \(!runDueBackup \|\| !restoredState\?\.connected\) return/)
})
