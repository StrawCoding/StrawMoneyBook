import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const searchPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/TransactionSearchPage.vue'),
  'utf8',
)
const transactionServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/transaction.service.js'),
  'utf8',
)
const transactionRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/transaction.repo.js'),
  'utf8',
)

test('TransactionSearchPage supports batch select mode', () => {
  assert.match(searchPageSource, /batchMode/)
  assert.match(searchPageSource, /selectedIds/)
  assert.match(searchPageSource, /toggleBatchMode/)
  assert.match(searchPageSource, /toggleSelectAll/)
  assert.match(searchPageSource, /toggleSelect/)
  assert.match(searchPageSource, /批量操作/)
})

test('TransactionSearchPage supports batch category change', () => {
  assert.match(searchPageSource, /batchCategorySheetOpen/)
  assert.match(searchPageSource, /batchCategoryId/)
  assert.match(searchPageSource, /applyBatchCategory/)
  assert.match(searchPageSource, /openBatchCategorySheet/)
  assert.match(searchPageSource, /更改分類/)
})

test('transaction service exports batchPatchCategory', () => {
  assert.match(transactionServiceSource, /export async function batchPatchCategory/)
  assert.match(transactionServiceSource, /batchPatchCategoryForTransactions/)
})

test('transaction repo exports batchPatchCategoryForTransactions', () => {
  assert.match(transactionRepoSource, /export async function batchPatchCategoryForTransactions/)
})
