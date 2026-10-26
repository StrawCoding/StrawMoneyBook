import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const transactionRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/transaction.repo.js'),
  'utf8',
)

const transactionQueryServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/transaction-query.service.js'),
  'utf8',
)

const transactionStoreSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/stores/transaction.store.js'),
  'utf8',
)

const homeTransactionFeedSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/home/HomeTransactionFeed.vue'),
  'utf8',
)

const homeAssetSummarySource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/home/HomeAssetSummaryCard.vue'),
  'utf8',
)

test('SMB-257 home transaction repository fixes page size at 300 with SQL offset pagination', () => {
  assert.match(transactionRepoSource, /export const HOME_TRANSACTION_PAGE_SIZE = 300/)
  assert.match(transactionRepoSource, /export async function listHomeTransactionsPage/)
  assert.match(transactionRepoSource, /LIMIT \? OFFSET \?/)
  assert.match(transactionRepoSource, /COUNT\(\*\) AS total/)
})

test('SMB-257 home transaction query service paginates all scope modes', () => {
  assert.match(transactionQueryServiceSource, /export async function listTransactionsForHome/)
  assert.match(transactionQueryServiceSource, /export async function summarizeHomeAssetTotals/)
  assert.match(transactionQueryServiceSource, /summarizeHomeAssetTotalsByScope/)
  assert.match(transactionQueryServiceSource, /offset: \(page - 1\) \* pageSize/)
  assert.doesNotMatch(transactionQueryServiceSource, /while \(true\)/)
})

test('smb287 home asset totals use SQL aggregate instead of page-scan', () => {
  assert.match(transactionRepoSource, /export async function summarizeHomeAssetTotalsByScope/)
  assert.match(transactionRepoSource, /income_minor/)
  assert.match(transactionRepoSource, /expense_minor/)
  assert.match(transactionRepoSource, /COALESCE\(t\.include_in_analysis, 1\) != 0/)
  assert.match(transactionQueryServiceSource, /listAllTransactionsChunked/)
  assert.match(transactionQueryServiceSource, /listRelatedTransactionsForDetail/)
})

test('SMB-257 transaction store tracks home pagination and asset totals separately from feed rows', () => {
  assert.doesNotMatch(transactionStoreSource, /HOME_ALL_TRANSACTIONS_DISPLAY_LIMIT/)
  assert.match(transactionStoreSource, /listTransactionsForHome/)
  assert.match(transactionStoreSource, /summarizeHomeAssetTotals/)
  assert.match(transactionStoreSource, /homePage:/)
  assert.match(transactionStoreSource, /homeTotal:/)
  assert.match(transactionStoreSource, /homeIncomeMinor:/)
})

test('SMB-257 home transaction feed exposes pagination controls and total badge count', () => {
  assert.match(homeTransactionFeedSource, /transactionStore\.homeTotal/)
  assert.match(homeTransactionFeedSource, /goNextHomePage/)
  assert.match(homeTransactionFeedSource, /home-tx-pagination/)
})

test('SMB-257 home asset summary uses store totals instead of paginated feed rows', () => {
  assert.match(homeAssetSummarySource, /transactionStore\.homeIncomeMinor/)
  assert.match(homeAssetSummarySource, /transactionStore\.homeExpenseMinor/)
  assert.doesNotMatch(homeAssetSummarySource, /transactionStore\.homeRecent/)
})
