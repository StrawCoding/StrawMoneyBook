/**
 * ART-04a — Credit card posting magnitudes (purchase / repayment / refund).
 */
import { normalizeMinor } from '../money.js'

/**
 * Credit flows take a non-negative magnitude then apply liability signs inside credit.service.
 * Matches legacy: Math.round(Math.abs(Number(value))).
 * @param {unknown} value
 * @returns {number}
 */
export function toCreditMagnitudeMinor(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new Error('amountMinor 必須為有效數字')
  }
  return Math.round(Math.abs(n))
}

/**
 * Liability / purchase legs are stored as negative on the credit account.
 * @param {unknown} magnitudeMinor
 */
export function toCreditLiabilityMinor(magnitudeMinor) {
  return -Math.abs(normalizeMinor(magnitudeMinor))
}
