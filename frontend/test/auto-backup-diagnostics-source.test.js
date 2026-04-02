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

  assert.match(webdavSource, /lastAutoCheckAt: ''/)
  assert.match(webdavSource, /lastAutoCheckStatus: 'idle'/)
  assert.match(webdavSource, /lastAutoCheckReason: ''/)
  assert.match(webdavSource, /lastAutoCheckStatus: 'skipped'/)
  assert.match(webdavSource, /lastAutoCheckStatus: 'ok'/)
  assert.match(webdavSource, /lastAutoCheckStatus: 'error'/)
  assert.match(webdavSource, /resolveWebdavAutoBackupSkipReason/)
})

test('auto backup settings page shows the latest auto-check reason and time', () => {
  assert.match(settingsSource, /settings_auto_backup\.status\.auto_check/)
  assert.match(settingsSource, /settings_auto_backup\.status\.last_check/)
  assert.match(settingsSource, /function describeAutoBackupCheck\(state\)/)
  assert.match(settingsSource, /googleBackupState\.lastAutoCheckAt/)
  assert.match(settingsSource, /webdavBackupState\.lastAutoCheckAt/)
  assert.match(settingsSource, /describeAutoBackupCheck\(googleBackupState\)/)
  assert.match(settingsSource, /describeAutoBackupCheck\(webdavBackupState\)/)
})
