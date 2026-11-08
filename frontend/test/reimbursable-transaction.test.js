import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isPendingReimbursableTransaction,
  reimbursableTransactionRowClass,
} from '../src/ui/utils/reimbursable-transaction.js'

test('flags pending reimbursable expense rows', () => {
  const tx = { type: 'expense', is_reimbursable: 1, reimbursement_state: 'pending' }
  assert.equal(isPendingReimbursableTransaction(tx), true)
  assert.equal(reimbursableTransactionRowClass(tx), 'tx-item--reimbursable')
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
  assert.equal(reimbursableTransactionRowClass({ type: 'expense', is_reimbursable: 0 }), '')
})
