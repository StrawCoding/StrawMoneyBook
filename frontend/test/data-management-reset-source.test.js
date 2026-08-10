import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsDataManagementPage.vue'),
  'utf8',
)

test('manual full reset creates a recovery backup before wiping local data', () => {
  assert.match(source, /async function createResetRecoveryBackup\(\)/)
  assert.match(source, /exportAllLedgersJson\(\)/)
  assert.match(source, /saveJsonFileToDevice\(filename, data, \{ category: 'data-management' \}\)/)
  assert.match(source, /downloadJsonFile\(filename, data\)/)
  assert.match(source, /await createResetRecoveryBackup\(\)[\s\S]*await resetDatabase\(\{/)
  assert.match(source, /DATA_WIPE_REASON\.USER_RESET_ALL/)
  assert.match(source, /confirmed:\s*true/)
})

test('smb297: JSON import requires confirm dialog and recovery backup before wipe', () => {
  assert.match(source, /isImportConfirmOpen/)
  assert.match(source, /openImportConfirm/)
  assert.match(source, /DATA_WIPE_REASON\.USER_IMPORT_JSON/)
  assert.match(source, /settings_data\.recovery\.title/)
})
