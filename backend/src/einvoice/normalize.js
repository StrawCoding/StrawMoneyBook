import { parseInvoiceDate } from './validation.js'

export function normalizeInvoiceFromPortal(item = {}) {
  const invoiceNumber = String(item.invoiceNumber ?? item.invNum ?? '').trim()
  const rawAmount = item.amount ?? item.invAmount ?? '0'
  const amount = Math.round(Number(String(rawAmount).replace(/,/g, '')) || 0)
  const dateRaw = item.invoiceDate ?? item.invDate ?? ''
  const invoiceDate = typeof dateRaw === 'number'
    ? dateRaw
    : parseInvoiceDate(String(dateRaw))

  return {
    invoiceNumber,
    amount,
    invoiceDate,
    merchantName: String(item.merchantName ?? item.sellerName ?? '').trim() || null,
    carrierName: String(item.carrierName ?? '手機條碼').trim() || '手機條碼',
    invStatus: String(item.invStatus ?? '').trim() || undefined,
  }
}

export function normalizeInvoiceList(items = []) {
  const list = []
  const seen = new Set()
  for (const item of items) {
    const normalized = normalizeInvoiceFromPortal(item)
    if (!normalized.invoiceNumber || seen.has(normalized.invoiceNumber)) continue
    seen.add(normalized.invoiceNumber)
    list.push(normalized)
  }
  return list
}
