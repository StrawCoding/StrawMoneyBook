import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { isPendingReimbursableTransaction } from '../src/ui/utils/reimbursable-transaction.js'

test('flags pending reimbursable expense rows', () => {
  const tx = { type: 'expense', is_reimbursable: 1, reimbursement_state: 'pending' }
  assert.equal(isPendingReimbursableTransaction(tx), true)
})

test('skips income, non-reimbursable, and reimbursed', () => {
  assert.equal(isPendingReimbursableTransaction({ type: 'income', is_reimbursable: 1 }), false)
  assert.equal(isPendingReimbursableTransaction({ type: 'expense', is_reimbursable: 0 }), false)
  assert.equal(
    isPendingReimbursableTransaction({
      type: 'expense',
      is_reimbursable: 1,
      reimbursement_state: 'reimbursed',
    }),
    false,
  )
})

test('home feed renders green reimbursable badge component', () => {
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
