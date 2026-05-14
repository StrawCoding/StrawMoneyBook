import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const loanServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/loan.service.js'),
  'utf8',
)

test('single loan repayment rejects amounts above the remaining balance', () => {
  assert.match(loanServiceSource, /if \(amountMinor > remainingMinor\) \{\s*throw new Error\('還款金額不可大於借貸剩餘金額'\)/s)
})

test('editing loan repayment rejects amounts above the target total', () => {
  assert.match(loanServiceSource, /const nextPaidMinor = paidExcludingCurrent \+ amountMinor\s*if \(nextPaidMinor > targetTotalMinor\) \{\s*throw new Error\('還款金額不可大於借貸剩餘金額'\)/s)
})
