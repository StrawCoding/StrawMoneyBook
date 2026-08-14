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
