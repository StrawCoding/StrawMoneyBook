import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  LOAN_OVERPAYMENT_ERROR,
  assertLoanRepaymentNotOverTarget,
  shouldBlockLoanOverpayment,
} from '../src/core/domain/posting/loan-posting-policy.js'

const loanServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/loan.service.js'),
  'utf8',
)

test('preset interest blocks a new repayment that would exceed remaining target', () => {
  assert.equal(
    shouldBlockLoanOverpayment({
      presetInterestMinor: 500,
      nextPaidMinor: 10_001,
      targetTotalMinor: 10_000,
    }),
    true,
  )
  assert.throws(
    () => assertLoanRepaymentNotOverTarget({
      presetInterestMinor: 500,
      nextPaidMinor: 10_001,
      targetTotalMinor: 10_000,
    }),
    { message: LOAN_OVERPAYMENT_ERROR },
  )
})

test('editing a repayment with preset interest blocks a new total above remaining target', () => {
  const paidExcludingCurrent = 4_000
  const amountMinor = 7_000
  const targetTotalMinor = 10_000
  assert.throws(
    () => assertLoanRepaymentNotOverTarget({
      presetInterestMinor: 200,
      nextPaidMinor: paidExcludingCurrent + amountMinor,
      targetTotalMinor,
    }),
    { message: LOAN_OVERPAYMENT_ERROR },
  )
})

test('repayment without preset interest allows amount exceeding remaining principal', () => {
  assert.equal(
    shouldBlockLoanOverpayment({
      presetInterestMinor: 0,
      nextPaidMinor: 12_000,
      targetTotalMinor: 10_000,
    }),
    false,
  )
  assert.doesNotThrow(() => assertLoanRepaymentNotOverTarget({
    presetInterestMinor: 0,
    nextPaidMinor: 12_000,
    targetTotalMinor: 10_000,
  }))
})

test('exact remaining amount with preset interest is allowed', () => {
  assert.doesNotThrow(() => assertLoanRepaymentNotOverTarget({
    presetInterestMinor: 100,
    nextPaidMinor: 10_000,
    targetTotalMinor: 10_000,
  }))
})

test('loan service uses the shared overpayment guard for create and edit', () => {
  assert.match(loanServiceSource, /assertLoanRepaymentNotOverTarget/)
  assert.match(
    loanServiceSource,
    /nextPaidMinor:\s*paidMinor \+ amountMinor/,
  )
  assert.match(
    loanServiceSource,
    /nextPaidMinor:\s*paidExcludingCurrent \+ amountMinor|const nextPaidMinor = paidExcludingCurrent \+ amountMinor/,
  )
})
