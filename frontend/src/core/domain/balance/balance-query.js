/**
 * ART-05 — Named balance query strategies (no God calculateBalance(type)).
 */
import { normalizeMinor } from '../money.js'

/**
 * Book balance for an asset/cash/liability account row that already includes
 * opening_balance_minor + SUM(transactions.amount_minor).
 * @param {unknown} balanceMinor
 * @returns {number}
 */
export function getAccountBookBalanceMinor(balanceMinor) {
  return normalizeMinor(balanceMinor ?? 0)
}

/**
 * Credit card debt from statement remaining (NOT raw account book balance).
 * @param {Array<{ remaining_minor?: unknown }>} unpaidStatements
 * @returns {number} positive debt magnitude
 */
export function getCreditCardDebtMinor(unpaidStatements = []) {
  const rows = Array.isArray(unpaidStatements) ? unpaidStatements : []
  let sum = 0
  for (const row of rows) {
    const remaining = Math.round(Number(row?.remaining_minor ?? row?.remainingMinor ?? 0))
    if (!Number.isFinite(remaining) || remaining <= 0) continue
    sum += remaining
  }
  return sum
}

/**
 * Running balance after applying a signed transaction amount.
 * @param {unknown} previousBalanceMinor
 * @param {unknown} amountMinor
 */
export function nextRunningBalanceMinor(previousBalanceMinor, amountMinor) {
  return normalizeMinor(previousBalanceMinor ?? 0) + normalizeMinor(amountMinor ?? 0)
}
