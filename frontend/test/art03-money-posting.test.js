/**
 * ART-03/04/05 — money, posting policies, balance query golden fixtures.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  absoluteMinor,
  assertNonNegativeMinor,
  assertNonZeroMinor,
  assertPositiveMinor,
  negateMinor,
  normalizeMinor,
} from '../src/core/domain/money.js'
import {
  toSignedIncomeExpenseMinor,
  toSignedManualUpdateMinor,
} from '../src/core/domain/posting/income-expense-policy.js'
import {
  toCreditLiabilityMinor,
  toCreditMagnitudeMinor,
} from '../src/core/domain/posting/credit-posting-policy.js'
import { toSecurityCashMagnitudeMinor } from '../src/core/domain/posting/security-posting-policy.js'
import {
  toLoanOpenPrincipalMinor,
  toLoanRepaymentInterestMinor,
  toLoanRepaymentPrincipalMinor,
} from '../src/core/domain/posting/loan-posting-policy.js'
import { toTransferLegAmounts } from '../src/core/domain/posting/transfer-posting-policy.js'
import {
  getAccountBookBalanceMinor,
  getCreditCardDebtMinor,
  nextRunningBalanceMinor,
} from '../src/core/domain/balance/balance-query.js'
import { computeActualCardDebtMinor } from '../src/core/utils/credit-card-apply.js'

test('ART-03 money primitives normalize / abs / negate', () => {
  assert.equal(normalizeMinor(12.4), 12)
  assert.equal(normalizeMinor(-12.6), -13)
  assert.equal(absoluteMinor(-250), 250)
  assert.equal(negateMinor(100), -100)
  assert.throws(() => normalizeMinor(Number.NaN), /有效數字/)
})

test('ART-03 asserts match legacy transaction.service gates', () => {
  assert.equal(assertNonNegativeMinor(0), 0)
  assert.throws(() => assertNonNegativeMinor(-1), /大於或等於 0/)
  assert.throws(() => assertNonNegativeMinor(1.5), /大於或等於 0/)
  assert.equal(assertPositiveMinor(1), 1)
  assert.throws(() => assertPositiveMinor(0), /大於 0/)
  assert.equal(assertNonZeroMinor(-5), -5)
  assert.throws(() => assertNonZeroMinor(0), /不能為 0/)
})

test('ART-03 IncomeExpensePostingPolicy golden signs (current product behavior)', () => {
  assert.equal(toSignedIncomeExpenseMinor('expense', 100), -100)
  assert.equal(toSignedIncomeExpenseMinor('expense', 0), 0)
  assert.equal(toSignedIncomeExpenseMinor('income', 100), 100)
  assert.equal(toSignedIncomeExpenseMinor('adjustment', -50), -50)
  assert.equal(toSignedIncomeExpenseMinor('adjustment', 50), 50)
  assert.throws(() => toSignedIncomeExpenseMinor('expense', -1), /大於或等於 0/)
  assert.throws(() => toSignedIncomeExpenseMinor('adjustment', 0), /不能為 0/)
  assert.throws(() => toSignedIncomeExpenseMinor('transfer', 10), /不支援/)
})

test('ART-03 manual update expense/income signs', () => {
  assert.equal(toSignedManualUpdateMinor('expense', 200), -200)
  assert.equal(toSignedManualUpdateMinor('income', 200), 200)
})

test('ART-04a credit posting magnitude + liability', () => {
  assert.equal(toCreditMagnitudeMinor(-1250.4), 1250)
  assert.equal(toCreditLiabilityMinor(1250), -1250)
})

test('ART-04b security cash magnitude', () => {
  assert.equal(toSecurityCashMagnitudeMinor(-999), 999)
})

test('ART-04c loan open / repayment signs', () => {
  assert.equal(toLoanOpenPrincipalMinor('lend', 10000), -10000)
  assert.equal(toLoanOpenPrincipalMinor('borrow', 10000), 10000)
  assert.equal(toLoanRepaymentPrincipalMinor('lend', 3000), 3000)
  assert.equal(toLoanRepaymentPrincipalMinor('borrow', 3000), -3000)
  assert.equal(toLoanRepaymentInterestMinor('borrow', 50), -50)
})

test('ART-04d transfer dual legs', () => {
  const legs = toTransferLegAmounts({ amountMinor: 1000, sourceExtraMinor: 50, toAmountMinor: 980 })
  assert.equal(legs.amountMinor, 1000)
  assert.equal(legs.sourceExtraMinor, 50)
  assert.equal(legs.outAmountMinor, -1050)
  assert.equal(legs.toAmountMinor, 980)
  assert.throws(() => toTransferLegAmounts({ amountMinor: 0, sourceExtraMinor: 0 }), /轉出金額/)
})

test('ART-05 named balance strategies (no God calculateBalance)', () => {
  assert.equal(getAccountBookBalanceMinor(12345.6), 12346)
  assert.equal(getCreditCardDebtMinor([
    { remaining_minor: 1000 },
    { remainingMinor: 250 },
    { remaining_minor: -5 },
  ]), 1250)
  assert.equal(computeActualCardDebtMinor([{ remaining_minor: 800 }]), 800)
  assert.equal(nextRunningBalanceMinor(1000, -250), 750)
})
