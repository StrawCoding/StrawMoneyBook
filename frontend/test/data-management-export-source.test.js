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
