import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const settingsSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsAutoBackupPage.vue'),
  'utf8',
)

test('auto backup settings page notifies the app when backup configuration changes', () => {
  assert.match(settingsSource, /function notifyAutoBackupConfigUpdated\(reason\) \{/)
  assert.match(settingsSource, /window\.dispatchEvent\(new CustomEvent\('app:auto-backup-config-updated', \{ detail \}\)\)/)
  assert.match(settingsSource, /provider: 'all'/)
  assert.match(settingsSource, /mode: 'config'/)
  assert.match(settingsSource, /status: 'completed'/)
  assert.match(settingsSource, /checkedAt/)
  assert.match(settingsSource, /notifyAutoBackupConfigUpdated\('webdav_connected'\)/)
  assert.match(settingsSource, /notifyAutoBackupConfigUpdated\('webdav_settings_saved'\)/)
  assert.match(settingsSource, /notifyAutoBackupConfigUpdated\('google_connected'\)/)
  assert.match(settingsSource, /notifyAutoBackupConfigUpdated\('google_settings_saved'\)/)
})

test('manual backup stops when settings cannot be saved first', () => {
  assert.match(settingsSource, /runManualAutoBackupProvider/)
  assert.match(settingsSource, /saveSettings: saveWebdavBackupSettings/)
  assert.match(settingsSource, /saveSettings: saveGoogleBackupSettings/)
  assert.match(settingsSource, /if \(result\?\.skipped\) return/)
})

test('settings page listens for background auto backup state updates for the active ledger only', () => {
  assert.match(settingsSource, /const AUTO_BACKUP_STATE_UPDATED_EVENT = 'app:auto-backup-state-updated'/)
  assert.match(settingsSource, /function shouldRefreshFromAutoBackupEvent\(detail\) \{/)
  assert.match(settingsSource, /return eventLedgerId === activeLedgerId/)
  assert.match(settingsSource, /window\.addEventListener\(AUTO_BACKUP_STATE_UPDATED_EVENT, handleAutoBackupStateUpdated\)/)
  assert.match(settingsSource, /window\.removeEventListener\(AUTO_BACKUP_STATE_UPDATED_EVENT, handleAutoBackupStateUpdated\)/)
})

test('manual backup error toast uses errorDetail not reason to avoid raw code strings in the UI (SMB-181)', () => {
  // When runManualAutoBackupProvider returns status=error, the UI must use
  // result.errorDetail (the original error message) rather than result.reason
  // (a raw code like 'backup_failed') so the user sees a readable message.
  assert.doesNotMatch(settingsSource, /throw new Error\(result\?\.reason/)
  assert.doesNotMatch(settingsSource, /throw new Error\(result\.reason/)
  assert.match(settingsSource, /throw new Error\(result\.errorDetail \|\| t\('settings_auto_backup\.toast\.webdav_backup_failed'\)\)/)
  assert.match(settingsSource, /throw new Error\(result\.errorDetail \|\| t\('settings_auto_backup\.toast\.google_backup_failed'\)\)/)
})

test('settings page refreshes Google backup state silently without opening interactive sign-in on mount', () => {
  assert.match(settingsSource, /return autoConnectGoogleBackup\(ledgerStore\.activeLedgerId, \{\s*allowInteractive: false,\s*\}\)/s)
  assert.doesNotMatch(settingsSource, /allowInteractiveWhenGoogleLinked: true/)
})

test('settings page refresh coordinator preserves unsaved WebDAV password input during background sync', () => {
  assert.match(settingsSource, /async function refreshAutoBackupState\(\{ preservePasswordInput = false } = \{\}\) \{/)
  assert.match(settingsSource, /const ticket = \+\+refreshCoordinatorTicket/)
  assert.match(settingsSource, /if \(ticket !== refreshCoordinatorTicket\) return/)
  assert.match(settingsSource, /applyWebdavBackupStateToForm\(webdavState, \{ preservePasswordInput }\)/)
  assert.match(settingsSource, /if \(!preservePasswordInput\) \{\s*webdavPasswordInput\.value = ''\s*\}/s)
  assert.match(settingsSource, /preservePasswordInput: Boolean\(webdavPasswordInput\.value\)/)
})
