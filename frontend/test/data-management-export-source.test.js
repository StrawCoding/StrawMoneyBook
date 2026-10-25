import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dataManagementSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsDataManagementPage.vue'),
  'utf8',
)

const exportServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/export.service.js'),
  'utf8',
)

test('data management exports use timestamped filenames to avoid overwriting previous exports', () => {
  assert.match(exportServiceSource, /export function timestampForFilename\(date = new Date\(\)\)/)
  assert.match(dataManagementSource, /timestampForFilename/)
  assert.match(dataManagementSource, /const filename = `strawmoneybook-all-ledgers-\$\{timestampForFilename\(\)\}\.json`/)
  assert.match(dataManagementSource, /filename = `transactions-\$\{ledgerStore\.activeLedgerId\}-\$\{timestampForFilename\(\)\}\.csv`/)
  assert.match(dataManagementSource, /filename = `accounts-\$\{ledgerStore\.activeLedgerId\}-\$\{timestampForFilename\(\)\}\.csv`/)
  assert.match(dataManagementSource, /filename = `categories-\$\{ledgerStore\.activeLedgerId\}-\$\{timestampForFilename\(\)\}\.csv`/)
})

test('data management import toasts use i18n keys instead of hardcoded zh-TW', () => {
  assert.match(dataManagementSource, /function importedLedgerLabel/)
  assert.match(dataManagementSource, /settings_auto_backup\.restore\.multiple_ledgers/)
  assert.match(dataManagementSource, /settings_data\.import\.hint_checked/)
  assert.match(dataManagementSource, /settings_data\.import\.hint_auto_fixed/)
  assert.match(dataManagementSource, /settings_data\.import\.hint_partial/)
  assert.match(dataManagementSource, /settings_data\.import\.hint_detected/)
  assert.doesNotMatch(dataManagementSource, /共 \$\{importedCount\} 本/)
  assert.doesNotMatch(dataManagementSource, /（已完成資料檢查）/)
  assert.doesNotMatch(dataManagementSource, /已自動修復 \$\{/)
  assert.doesNotMatch(dataManagementSource, /偵測 \$\{/)
})
