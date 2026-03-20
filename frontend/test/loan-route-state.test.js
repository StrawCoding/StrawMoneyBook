import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildLoanCounterpartyQuery,
  buildLoanListQuery,
  normalizeLoanFinished,
  normalizeLoanTab,
  toLoanFinishedQueryValue,
} from '../src/ui/views/loans/loan-route-state.js'

test('normalizes loan route params consistently', () => {
  assert.equal(normalizeLoanTab('borrow'), 'borrow')
  assert.equal(normalizeLoanTab('something-else'), 'lend')
  assert.equal(normalizeLoanFinished('1'), true)
  assert.equal(normalizeLoanFinished('true'), true)
  assert.equal(normalizeLoanFinished('0'), false)
  assert.equal(toLoanFinishedQueryValue(true), '1')
  assert.equal(toLoanFinishedQueryValue(false), '0')
})

test('builds list and counterparty queries without losing state', () => {
  assert.deepEqual(
    buildLoanListQuery({ foo: 'bar' }, { tab: 'borrow', showFinished: true }),
    { foo: 'bar', tab: 'borrow', finished: '1' },
  )

  assert.deepEqual(
    buildLoanCounterpartyQuery({ foo: 'bar' }, { name: 'Alex', tab: 'lend', showFinished: false }),
    { foo: 'bar', tab: 'lend', finished: '0', name: 'Alex' },
  )

  assert.deepEqual(
    buildLoanCounterpartyQuery({ foo: 'bar', name: 'Alex' }, { name: '', tab: 'lend', showFinished: false }),
    { foo: 'bar', tab: 'lend', finished: '0' },
  )
})
