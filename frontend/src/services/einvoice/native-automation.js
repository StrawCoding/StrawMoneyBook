import { Capacitor, registerPlugin } from '@capacitor/core'

const EInvoiceAutomation = registerPlugin('EInvoiceAutomation')

export function isEInvoiceAutomationRuntimeSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function wrapNativeError(error) {
  const msg = String(error?.message ?? '').trim() || '電子發票自動抓取失敗'
  const code = String(error?.code ?? '').trim() || 'einvoice_automation_failed'
  const err = new Error(msg)
  err.code = code
  return err
}

export async function queryNativeEInvoices(params) {
  try {
    const result = await EInvoiceAutomation.queryInvoices({
      phone: String(params?.phone ?? '').trim(),
      password: String(params?.password ?? ''),
      dateFrom: String(params?.dateFrom ?? '').trim(),
      dateTo: String(params?.dateTo ?? '').trim(),
      invoiceStatus: String(params?.invoiceStatus ?? 'all').trim(),
      buyerTaxId: String(params?.buyerTaxId ?? '').trim(),
      keyword: String(params?.keyword ?? '').trim(),
    })
    return Array.isArray(result?.invoices) ? result.invoices : []
  } catch (error) {
    throw wrapNativeError(error)
  }
}
