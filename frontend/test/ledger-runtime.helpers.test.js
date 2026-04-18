import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveInitialActiveLedgerId,
  sumNumericValues,
} from '../src/ui/services/ledger-runtime.helpers.js'

test('ledger runtime helper prefers first ledger for free tier and falls back safely', () => {
  const ledgers = [{ id: 'ledger-a' }, { id: 'ledger-b' }]

  assert.equal(
    resolveInitialActiveLedgerId(ledgers, {
      cachedLedgerId: 'ledger-b',
      membershipTier: 'free',
    }),
    'ledger-a',
  )
  assert.equal(
    resolveInitialActiveLedgerId(ledgers, {
      cachedLedgerId: 'ledger-b',
      membershipTier: 'member',
    }),
    'ledger-b',
  )
  assert.equal(resolveInitialActiveLedgerId([], {}), '')
})

test('ledger runtime helper sums numeric issue counts defensively', () => {
  assert.equal(sumNumericValues({ orphaned: 2, missing: '3', ignored: null }), 5)
  assert.equal(sumNumericValues(null), 0)
})
