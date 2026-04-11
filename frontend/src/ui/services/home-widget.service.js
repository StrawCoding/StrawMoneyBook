import { Capacitor, registerPlugin } from '@capacitor/core'
import { listTransactionsByMonth } from '@/core/repositories/transaction.repo'
import { buildHomeWidgetSummaryPayload } from '@/ui/services/home-widget-summary'
import { monthKeyFromDate } from '@/core/utils/id'

const HomeWidget = registerPlugin('HomeWidget')

function isAndroidNativeRuntime() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export function isHomeWidgetSupported() {
  return isAndroidNativeRuntime()
}

export async function clearHomeWidgetSummary() {
  if (!isAndroidNativeRuntime()) return false
  await HomeWidget.clearSummary()
  return true
}

export async function syncHomeWidgetSummary(ledgerId, options = {}) {
  if (!isAndroidNativeRuntime()) return false

  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) {
    await clearHomeWidgetSummary()
    return false
  }

  const transactions = await listTransactionsByMonth(normalizedLedgerId, monthKeyFromDate())
  await HomeWidget.updateSummary(buildHomeWidgetSummaryPayload(transactions, options))
  return true
}
