import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const bankSyncRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/bank-sync.repo.js'),
  'utf8',
)

const bankSyncServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/bank-sync.service.js'),
  'utf8',
)

const bankSyncConnectionPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsBankSyncConnectionPage.vue'),
  'utf8',
)

test('bank review repository fixes page size at 300 with SQL offset pagination', () => {
  assert.match(bankSyncRepoSource, /export const BANK_REVIEW_PAGE_SIZE = 300/)
  assert.match(bankSyncRepoSource, /export async function countBankTransactionsForReview/)
  assert.match(bankSyncRepoSource, /LIMIT \? OFFSET \?/)
  assert.match(bankSyncRepoSource, /COUNT\(\*\) AS total/)
})

test('bank review service uses COUNT instead of loading up to 10000 rows for badges', () => {
  assert.match(bankSyncServiceSource, /countBankTransactionsForReview/)
  assert.doesNotMatch(bankSyncServiceSource, /limit: 10000/)
  assert.match(bankSyncServiceSource, /offset: \(page - 1\) \* pageSize/)
})

test('bank sync connection review page exposes pagination controls', () => {
  assert.match(bankSyncConnectionPageSource, /reviewTotal/)
  assert.match(bankSyncConnectionPageSource, /goNextReviewPage/)
  assert.match(bankSyncConnectionPageSource, /pagination-bar/)
})
