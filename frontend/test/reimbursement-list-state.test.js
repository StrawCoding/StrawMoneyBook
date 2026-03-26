import test from 'node:test'
import assert from 'node:assert/strict'

import {
  partitionReimbursementTransactions,
  resolveReimbursementListState,
} from '../src/core/utils/reimbursement-list-state.js'

test('treats reimbursable transactions with any reimbursed amount as reimbursed even when the stored state is stale', () => {
  assert.equal(resolveReimbursementListState({
    id: 'tx_1',
    is_reimbursable: 1,
    reimbursement_state: 'pending',
    reimbursed_minor: 2500,
  }), 'reimbursed')
})

test('keeps reimbursable transactions pending when no reimbursement amount exists', () => {
  assert.equal(resolveReimbursementListState({
    id: 'tx_2',
    is_reimbursable: 1,
    reimbursement_state: 'reimbursed',
    reimbursed_minor: 0,
  }), 'pending')
})

test('partitions mixed reimbursement rows by their effective settlement state', () => {
  const rows = [
    { id: 'pending_1', is_reimbursable: 1, reimbursed_minor: 0 },
    { id: 'done_1', is_reimbursable: 1, reimbursed_minor: 1000 },
    { id: 'ignored_1', is_reimbursable: 0, reimbursed_minor: 3000 },
  ]

  assert.deepEqual(
    partitionReimbursementTransactions(rows),
    {
      pending: [{ id: 'pending_1', is_reimbursable: 1, reimbursed_minor: 0 }],
      reimbursed: [{ id: 'done_1', is_reimbursable: 1, reimbursed_minor: 1000 }],
    },
  )
})
