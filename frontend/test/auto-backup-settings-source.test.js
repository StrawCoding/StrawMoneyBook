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
  assert.match(settingsSource, /notifyAutoBackupConfigUpdated\('webdav_connected'\)/)
  assert.match(settingsSource, /notifyAutoBackupConfigUpdated\('webdav_settings_saved'\)/)
  assert.match(settingsSource, /notifyAutoBackupConfigUpdated\('google_connected'\)/)
  assert.match(settingsSource, /notifyAutoBackupConfigUpdated\('google_settings_saved'\)/)
})

test('manual backup stops when settings cannot be saved first', () => {
  assert.match(settingsSource, /return false/)
  assert.match(settingsSource, /const settingsSaved = await saveWebdavBackupSettings\(\)\s+if \(!settingsSaved\) return/)
  assert.match(settingsSource, /const settingsSaved = await saveGoogleBackupSettings\(\)\s+if \(!settingsSaved\) return/)
})
