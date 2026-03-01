import { Capacitor, registerPlugin } from '@capacitor/core'
import { listTransactionsByMonth } from '@/core/repositories/transaction.repo'

const HomeWidget = registerPlugin('HomeWidget')

function isAndroidNativeRuntime() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function monthKeyFromDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function normalizeCurrencyCode(currencyCode) {
  const normalized = String(currencyCode ?? '').trim().toUpperCase()
  return normalized || 'TWD'
}

export function isHomeWidgetSupported() {
  return isAndroidNativeRuntime()
}

export async function clearHomeWidgetSummary() {
  if (!isAndroidNativeRuntime()) return false
  await HomeWidget.clearSummary()
  return true
}

export async function syncHomeWidgetSummary(ledgerId, currencyCode) {
  if (!isAndroidNativeRuntime()) return false

  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) {
    await clearHomeWidgetSummary()
    return false
  }

  const transactions = await listTransactionsByMonth(normalizedLedgerId, monthKeyFromDate())
  let incomeMinor = 0
  let expenseMinor = 0

  for (const tx of transactions) {
    if (Number(tx?.include_in_analysis) === 0) continue
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

  await HomeWidget.updateSummary({
    incomeMinor,
    expenseMinor,
    currencyCode: normalizeCurrencyCode(currencyCode),
  })
  return true
}
