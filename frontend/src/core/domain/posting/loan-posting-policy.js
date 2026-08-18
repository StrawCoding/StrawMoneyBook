/**
 * ART-04c — Loan principal / repayment posting signs.
 */
import { assertPositiveMinor, normalizeMinor } from '../money.js'

/**
 * Opening principal: lend = negative cash out; borrow = positive cash in.
 * @param {'lend' | 'borrow'} direction
 * @param {unknown} principalMinor
 */
export function toLoanOpenPrincipalMinor(direction, principalMinor) {
  const principal = assertPositiveMinor(principalMinor)
  return String(direction) === 'lend' ? -principal : principal
}

/**
 * Repayment principal component relative to loan direction.
 * @param {'lend' | 'borrow'} direction
 * @param {unknown} principalComponentMinor
 */
export function toLoanRepaymentPrincipalMinor(direction, principalComponentMinor) {
  const amount = Math.abs(normalizeMinor(principalComponentMinor))
  return String(direction) === 'lend' ? amount : -amount
}

/**
 * Interest component relative to loan direction (same sign rule as principal component).
 * @param {'lend' | 'borrow'} direction
 * @param {unknown} interestComponentMinor
 */
export function toLoanRepaymentInterestMinor(direction, interestComponentMinor) {
  return toLoanRepaymentPrincipalMinor(direction, interestComponentMinor)
}

export const LOAN_OVERPAYMENT_ERROR = '還款金額不可大於借貸剩餘金額'

/**
 * Block over-payment only when the loan has preset interest.
 * Without preset interest, amounts above remaining principal are allowed (interest feature).
 */
export function shouldBlockLoanOverpayment({
  presetInterestMinor,
  nextPaidMinor,
  targetTotalMinor,
}) {
  return Number(presetInterestMinor) > 0 && Number(nextPaidMinor) > Number(targetTotalMinor)
}

export function assertLoanRepaymentNotOverTarget(params) {
  if (shouldBlockLoanOverpayment(params)) {
    throw new Error(LOAN_OVERPAYMENT_ERROR)
  }
}
