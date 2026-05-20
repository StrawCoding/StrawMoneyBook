import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const loanServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/loan.service.js'),
  'utf8',
)

test('single loan repayment blocks over-payment only when preset interest is set', () => {
  assert.match(loanServiceSource, /if \(presetInterestMinor > 0 && amountMinor > remainingMinor\) \{\s*throw new Error\('還款金額不可大於借貸剩餘金額'\)/s)
})

test('editing loan repayment blocks over-payment only when preset interest is set', () => {
  assert.match(loanServiceSource, /const nextPaidMinor = paidExcludingCurrent \+ amountMinor\s*if \(presetInterestMinor > 0 && nextPaidMinor > targetTotalMinor\) \{\s*throw new Error\('還款金額不可大於借貸剩餘金額'\)/s)
})

test('repayment without preset interest allows amount exceeding remaining principal (interest feature)', () => {
  assert.match(loanServiceSource, /const presetInterestMinor = Number\(loan\.preset_interest_minor \?\? 0\)/s)
  assert.doesNotMatch(
    loanServiceSource,
    /if \(amountMinor > remainingMinor\) \{\s*throw new Error\('還款金額不可大於借貸剩餘金額'\)/s,
  )
})
