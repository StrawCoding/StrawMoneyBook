import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeLoanCounterpartyName } from '../src/core/services/loan-counterparty-name.js'

test('filters invalid loan counterparty tokens and keeps valid names', () => {
  assert.equal(normalizeLoanCounterpartyName('出'), '')
  assert.equal(normalizeLoanCounterpartyName('借入'), '')
  assert.equal(normalizeLoanCounterpartyName('支出'), '')
  assert.equal(normalizeLoanCounterpartyName('NT$500'), '')
  assert.equal(normalizeLoanCounterpartyName('昨天'), '')
  assert.equal(normalizeLoanCounterpartyName('小明'), '小明')
  assert.equal(normalizeLoanCounterpartyName(' 還給 小美 '), '小美')
})
