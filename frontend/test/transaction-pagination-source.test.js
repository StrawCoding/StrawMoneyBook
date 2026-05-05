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

const transactionSearchComposableSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/composables/useTransactionSearchPage.js'),
  'utf8',
)

const transactionSearchPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/TransactionSearchPage.vue'),
  'utf8',
)

const accountDetailPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/accounts/AccountDetailPage.vue'),
  'utf8',
)

test('SMB-155 transaction query service fixes transaction page size at 300', () => {
  assert.match(transactionQueryServiceSource, /export const TRANSACTION_PAGE_SIZE = 300/)
  assert.match(transactionQueryServiceSource, /limit: pageSize/)
  assert.match(transactionQueryServiceSource, /offset: \(page - 1\) \* pageSize/)
})

test('SMB-155 repository uses SQL pagination for search and account transaction pages', () => {
  assert.match(transactionRepoSource, /export async function listTransactionSearchPage/)
  assert.match(transactionRepoSource, /export async function listTransactionsByAccountPage/)
  assert.match(transactionRepoSource, /LIMIT \? OFFSET \?/)
  assert.match(transactionRepoSource, /COUNT\(\*\) AS total/)
})

test('SMB-155 account pagination keeps page balances based on skipped transactions', () => {
  assert.match(transactionRepoSource, /before_amount_minor/)
  assert.match(accountDetailPageSource, /currentAccountBalanceMinor\.value - accountTransactionBeforeAmountMinor\.value/)
})

test('SMB-155 search and account pages expose pagination controls', () => {
  assert.match(transactionSearchComposableSource, /searchTotal/)
  assert.match(transactionSearchComposableSource, /goNextPage/)
  assert.match(transactionSearchPageSource, /pagination-bar/)
  assert.match(accountDetailPageSource, /goNextAccountTransactionPage/)
})
