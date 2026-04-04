import { isCountableForIncomeExpense } from '../utils/refund-transaction.js'

function normalizeCurrencyCode(currencyCode) {
  const normalized = String(currencyCode ?? '').trim().toUpperCase()
  return normalized || 'TWD'
}

function normalizeLedgerName(ledgerName) {
  return String(ledgerName ?? '').trim()
}

export function buildHomeWidgetSummaryPayload(transactions, options = {}) {
  let incomeMinor = 0
  let expenseMinor = 0

  for (const tx of transactions ?? []) {
    if (!isCountableForIncomeExpense(tx)) continue
    const type = String(tx?.type ?? '')
    const amount = Math.round(Number(tx?.amount_minor ?? 0))
    if (type === 'income' && amount > 0) {
      incomeMinor += amount
      continue
    }
    if (type === 'expense' && amount < 0) {
      expenseMinor += Math.abs(amount)
    }
  }

  return {
    incomeMinor,
    expenseMinor,
    currencyCode: normalizeCurrencyCode(options.currencyCode),
    ledgerName: normalizeLedgerName(options.ledgerName),
  }
}
