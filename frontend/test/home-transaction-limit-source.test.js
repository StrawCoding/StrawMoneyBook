import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const transactionRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/transaction.repo.js'),
  'utf8',
)

const transactionStoreSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/stores/transaction.store.js'),
  'utf8',
)

test('transaction repo supports an optional listAllTransactions limit', () => {
  assert.match(transactionRepoSource, /export async function listAllTransactions\(ledgerId, \{ limit, offset = 0 \} = \{\}\)/)
  assert.match(transactionRepoSource, /const hasLimit = Number\.isFinite\(limit\) && limit > 0/)
  assert.match(transactionRepoSource, /\$\{hasLimit \? 'LIMIT \? OFFSET \?' : ''\};/)
})

test('home all mode caps transaction loading to avoid rendering huge ledgers at once', () => {
  assert.match(transactionStoreSource, /const HOME_ALL_TRANSACTIONS_DISPLAY_LIMIT = 3000/)
  assert.match(transactionStoreSource, /listAllTransactions\(ledgerId, \{ limit: HOME_ALL_TRANSACTIONS_DISPLAY_LIMIT \}\)/)
})
