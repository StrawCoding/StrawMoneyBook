import test from 'node:test'
import assert from 'node:assert/strict'

import { calculateAssetSummary } from '../src/core/utils/assets-summary.js'

test('deducts reimbursement advances from disposable and total assets', () => {
  const result = calculateAssetSummary({
    balances: [
      {
        id: 'cash',
        account_type: 'asset',
        include_in_assets: 1,
        balance_minor: 125000,
        reimbursement_advance_minor: 25000,
      },
    ],
    receivableMinor: 30000,
    payableMinor: 10000,
    unreimbursedMinor: 5000,
  })

  assert.equal(result.disposableMinor, 100000)
  assert.equal(result.advanceDeductedMinor, 25000)
  assert.equal(result.totalAssetMinor, 125000)
})

test('does not deduct advance from excluded accounts and still tracks liabilities', () => {
  const result = calculateAssetSummary({
    balances: [
      {
        id: 'excluded',
        account_type: 'asset',
        include_in_assets: 0,
        balance_minor: 80000,
        reimbursement_advance_minor: 40000,
      },
      {
        id: 'credit',
        account_type: 'liability',
        include_in_assets: 1,
        balance_minor: 12000,
        reimbursement_advance_minor: 0,
      },
      {
        id: 'overdrawn',
        account_type: 'asset',
        include_in_assets: 1,
        balance_minor: -5000,
        reimbursement_advance_minor: 0,
      },
    ],
  })

  assert.equal(result.disposableMinor, 0)
  assert.equal(result.advanceDeductedMinor, 0)
  assert.equal(result.liabilityMinor, 17000)
})
