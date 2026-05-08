import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const googleSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/google-backup.service.js'),
  'utf8',
)
const webdavSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/webdav-backup.service.js'),
  'utf8',
)
const settingsSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsAutoBackupPage.vue'),
  'utf8',
)

test('auto backup services persist auto-check diagnostics for skip, success, and error states', () => {
  assert.match(googleSource, /lastAutoCheckAt: ''/)
  assert.match(googleSource, /lastAutoCheckStatus: 'idle'/)
  assert.match(googleSource, /lastAutoCheckReason: ''/)
  assert.match(googleSource, /lastAutoCheckStatus: 'skipped'/)
  assert.match(googleSource, /lastAutoCheckStatus: 'ok'/)
  assert.match(googleSource, /lastAutoCheckStatus: 'error'/)
  assert.match(googleSource, /resolveGoogleAutoBackupSkipReason/)
  assert.match(googleSource, /lastAutoCheckReason: 'platform_unsupported'/)

  assert.match(webdavSource, /lastAutoCheckAt: ''/)
  assert.match(webdavSource, /lastAutoCheckStatus: 'idle'/)
  assert.match(webdavSource, /lastAutoCheckReason: ''/)
  assert.match(webdavSource, /lastAutoCheckStatus: 'skipped'/)
  assert.match(webdavSource, /lastAutoCheckStatus: 'ok'/)
  assert.match(webdavSource, /lastAutoCheckStatus: 'error'/)
  assert.match(webdavSource, /resolveWebdavAutoBackupSkipReason/)
})

test('google backup reconnect patch restores connection state without resetting auto-check diagnostics (SMB-156)', () => {
  // buildRecoveredGoogleBackupPatch is used when Google silently or interactively reconnects.
  // It must NOT reset lastAutoCheckAt/Status/Reason — those are written by the auto backup runner
  // and must survive reconnection so the UI shows the last actual detection result.
  // Only disconnectGoogleBackup explicitly clears auto-check fields (intentional reset).
  assert.match(googleSource, /function buildRecoveredGoogleBackupPatch\(patch = \{\}\)/)
  assert.match(googleSource, /buildRecoveredGoogleBackupPatch\(profilePatch\)/)
  assert.match(googleSource, /buildRecoveredGoogleBackupPatch\(\)/)
  assert.match(googleSource, /return saveState\(ledgerId, buildRecoveredGoogleBackupPatch\(\{/)

  // Extract just the function body to verify it does not reset auto-check fields
  const fnMatch = googleSource.match(/function buildRecoveredGoogleBackupPatch[\s\S]*?\n  \}/)
  const fnBody = fnMatch ? fnMatch[0] : ''
  assert.ok(!fnBody.includes('lastAutoCheckAt'), 'buildRecoveredGoogleBackupPatch must not reset lastAutoCheckAt')
  assert.ok(!fnBody.includes('lastAutoCheckStatus'), 'buildRecoveredGoogleBackupPatch must not reset lastAutoCheckStatus')
  assert.ok(!fnBody.includes('lastAutoCheckReason'), 'buildRecoveredGoogleBackupPatch must not reset lastAutoCheckReason')
})

test('auto backup settings page shows the latest auto-check reason and time', () => {
  assert.match(settingsSource, /settings_auto_backup\.status\.auto_check/)
  assert.match(settingsSource, /settings_auto_backup\.status\.last_check/)
  assert.match(settingsSource, /function describeAutoBackupCheck\(state\)/)
  assert.match(settingsSource, /googleBackupState\.lastAutoCheckAt/)
  assert.match(settingsSource, /webdavBackupState\.lastAutoCheckAt/)
  assert.match(settingsSource, /describeAutoBackupCheck\(googleBackupState\)/)
  assert.match(settingsSource, /describeAutoBackupCheck\(webdavBackupState\)/)
  assert.match(settingsSource, /settings_auto_backup\.auto_check\.platform_unsupported/)
})

test('google auto backup surfaces auth failure as error instead of skip when backup is configured (SMB-110)', () => {
  // Regression: when Google auth expires and the user has backup configured (autoEnabled or accountEmail),
  // the service must write lastAutoCheckStatus: 'error' + lastAutoCheckReason: 'reauth_required'
  // so that the UI reauth warning is shown.  Previously it silently wrote 'skipped'/'not_connected'.
  assert.match(googleSource, /isAuthFailure/, 'must have isAuthFailure detection')
  assert.match(googleSource, /reauth_required/, 'must surface reauth_required as the error reason')
  assert.match(
    googleSource,
    /lastAutoCheckStatus: isAuthFailure \? 'error' : 'skipped'/,
    'must write error status when auth failure detected in runGoogleAutoBackupIfDue',
  )
  assert.match(
    googleSource,
    /lastAutoCheckReason: isAuthFailure \? 'reauth_required' : skipReason/,
    'must write reauth_required reason when auth failure detected',
  )
  // Ensure the pattern also applies to the data-change path
  const authFailureMatches = [...googleSource.matchAll(/isAuthFailure \? 'error' : 'skipped'/g)]
  assert.ok(authFailureMatches.length >= 2, 'both runGoogleAutoBackupIfDue and runGoogleAutoBackupOnDataChange must detect auth failures')
})
