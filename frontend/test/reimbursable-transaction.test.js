import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  isPendingReimbursableTransaction,
  isReimbursableExpenseTransaction,
  readReimbursableFlag,
  reimbursableTransactionBadgeVariant,
} from '../src/ui/utils/reimbursable-transaction.js'

test('reads reimbursable flag from snake_case or camelCase', () => {
  assert.equal(readReimbursableFlag({ is_reimbursable: 1 }), true)
  assert.equal(readReimbursableFlag({ isReimbursable: true }), true)
  assert.equal(readReimbursableFlag({ is_reimbursable: '1' }), true)
  assert.equal(readReimbursableFlag({ is_reimbursable: 0 }), false)
})

test('pending reimbursable expense shows green badge variant', () => {
  const tx = { type: 'expense', is_reimbursable: 1, reimbursement_state: 'pending' }
  assert.equal(reimbursableTransactionBadgeVariant(tx), 'pending')
  assert.equal(isPendingReimbursableTransaction(tx), true)
  assert.equal(isReimbursableExpenseTransaction(tx), true)
})

test('settled reimbursable expense still shows settled badge', () => {
  const tx = { type: 'expense', is_reimbursable: 1, reimbursement_state: 'reimbursed' }
  assert.equal(reimbursableTransactionBadgeVariant(tx), 'settled')
  assert.equal(isPendingReimbursableTransaction(tx), false)
  assert.equal(isReimbursableExpenseTransaction(tx), true)
})

test('skips income and non-reimbursable', () => {
  assert.equal(reimbursableTransactionBadgeVariant({ type: 'income', is_reimbursable: 1 }), null)
  assert.equal(reimbursableTransactionBadgeVariant({ type: 'expense', is_reimbursable: 0 }), null)
})

test('home feed renders reimbursable badge component', () => {
  const src = readFileSync(
    resolve('src/ui/components/home/HomeTransactionFeed.vue'),
    'utf8',
  )
  assert.match(src, /ReimbursableTransactionBadge/)
  const badgeVue = readFileSync(
    resolve('src/ui/components/transactions/ReimbursableTransactionBadge.vue'),
    'utf8',
  )
  assert.match(badgeVue, /tx-reimbursable-badge/)
  assert.match(readFileSync(resolve('src/ui/assets/css/global.css'), 'utf8'), /\.tx-reimbursable-badge/)
})
