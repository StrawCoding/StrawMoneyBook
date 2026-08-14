/**
 * ART-03 — Money primitives (minor units only).
 * Keep domain posting rules in posting/* — do not grow this into a God MoneyPolicy.
 */

/**
 * @typedef {number} MinorAmount
 */

/**
 * Coerce to a finite integer minor amount (round half away from zero via Math.round).
 * @param {unknown} value
 * @returns {MinorAmount}
 */
export function normalizeMinor(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new Error('amountMinor 必須為有效數字')
  }
  return Math.round(n)
}

/**
 * @param {unknown} value
 * @returns {MinorAmount}
 */
export function absoluteMinor(value) {
  return Math.abs(normalizeMinor(value))
}

/**
 * @param {unknown} value
 * @returns {MinorAmount}
 */
export function negateMinor(value) {
  const n = normalizeMinor(value)
  return n === 0 ? 0 : -n
}

/**
 * Non-negative integer minor (0 allowed). Matches legacy assertNonNegativeAmount.
 * @param {unknown} value
 * @returns {MinorAmount}
 */
export function assertNonNegativeMinor(value) {
  const amount = Number(value)
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error('amountMinor 必須為大於或等於 0 的數字')
  }
  return amount
}

/**
 * Positive integer minor (> 0). Matches legacy assertPositiveAmount.
 * @param {unknown} value
 * @returns {MinorAmount}
 */
export function assertPositiveMinor(value) {
  const amount = Number(value)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('amountMinor 必須為大於 0 的數字')
  }
  return amount
}

/**
 * Finite non-zero minor (adjustment). Matches legacy createAdjustment gate.
 * @param {unknown} value
 * @returns {MinorAmount}
 */
export function assertNonZeroMinor(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error('adjustment amountMinor 不能為 0')
  }
  return amount
}
