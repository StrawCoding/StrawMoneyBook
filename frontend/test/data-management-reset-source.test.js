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
  assert.match(source, /await createResetRecoveryBackup\(\)[\s\S]*await resetDatabase\(\)/)
})
