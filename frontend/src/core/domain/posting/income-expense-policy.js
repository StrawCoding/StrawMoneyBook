/**
 * ART-03 — Income / expense / adjustment posting signs for the general ledger.
 * Credit / security / loan / transfer have their own policies (ART-04*).
 */
import {
  absoluteMinor,
  assertNonNegativeMinor,
  assertNonZeroMinor,
  negateMinor,
  normalizeMinor,
} from '../money.js'

/**
 * @param {'expense' | 'income' | 'adjustment'} type
 * @param {unknown} amountMinor
 * @returns {number} signed amount_minor for DB storage
 */
export function toSignedIncomeExpenseMinor(type, amountMinor) {
  const normalizedType = String(type ?? '').trim().toLowerCase()
  if (normalizedType === 'expense') {
    assertNonNegativeMinor(amountMinor)
    return negateMinor(absoluteMinor(amountMinor))
  }
  if (normalizedType === 'income') {
    assertNonNegativeMinor(amountMinor)
    return absoluteMinor(amountMinor)
  }
  if (normalizedType === 'adjustment') {
    const amount = assertNonZeroMinor(amountMinor)
    return normalizeMinor(amount)
  }
  throw new Error(`不支援的收支類型: ${normalizedType || '(empty)'}`)
}

/**
 * Update-path signing for manual expense/income (UI sends non-negative magnitude).
 * @param {'expense' | 'income'} type
 * @param {unknown} amountMinor
 */
export function toSignedManualUpdateMinor(type, amountMinor) {
  const normalizedType = String(type ?? '').trim().toLowerCase()
  assertNonNegativeMinor(amountMinor)
  const magnitude = absoluteMinor(amountMinor)
  if (normalizedType === 'expense') return negateMinor(magnitude)
  if (normalizedType === 'income') return magnitude
  throw new Error(`不支援的更新類型: ${normalizedType || '(empty)'}`)
}
