import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const backendSource = readFileSync(
  resolve(import.meta.dirname, '../src/services/bank-sync/backend.js'),
  'utf8',
)

const serviceSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/bank-sync.service.js'),
  'utf8',
)

const apiUtilsSource = readFileSync(
  resolve(import.meta.dirname, '../api/bank/_utils.js'),
  'utf8',
)

test('bank sync feature flag is controlled by VITE_BANK_SYNC_FEATURE_ENABLED', () => {
  assert.match(backendSource, /VITE_BANK_SYNC_FEATURE_ENABLED/)
  assert.doesNotMatch(backendSource, /const BANK_SYNC_FEATURE_ENABLED = false/)
})

test('production provider fallback exposes registered native banks', () => {
  assert.match(backendSource, /listRegisteredBankProviders|provider-registry/)
  assert.doesNotMatch(backendSource, /mock_bank_tw/)
})

test('bank sync backend routes native providers via connectNativeBank', () => {
  assert.match(backendSource, /connectNativeBank/)
  assert.match(backendSource, /syncNativeBank/)
  assert.match(backendSource, /isRegisteredBankProviderId/)
})

test('bank sync service exposes batch account save helper', () => {
  assert.match(serviceSource, /export async function saveBankAccountsSettings/)
  assert.match(serviceSource, /export async function countBankReviewTransactionsByConnection/)
  assert.match(serviceSource, /countBankTransactionsForReview/)
})

test('bank sync API utils no longer treat mock provider as supported', () => {
  assert.match(apiUtilsSource, /if \(isFirstBankProvider\(provider\)\) return BANK_SYNC_ENABLE_UNSUPPORTED_REAL_PROVIDERS/)
  assert.doesNotMatch(apiUtilsSource, /if \(isMockProvider\(provider\)\) return true/)
})

test('bank sync backend debug mode opens web and logs actions', () => {
  assert.match(backendSource, /isBankSyncDebugEnabled/)
  assert.match(backendSource, /logBankSyncAction/)
  assert.match(backendSource, /androidOnly: !debugEnabled/)
  assert.match(serviceSource, /logBankSyncAction/)
})
