function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeDateInput(value) {
  const text = normalizeText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function buildDefaultEinvoiceSyncFilter(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now)
  const end = new Date(date)
  const start = new Date(date)
  start.setDate(1)
  const format = (value) => {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return {
    dateFrom: format(start),
    dateTo: format(end),
    carrier: 'all',
    status: 'all',
    buyerBan: '',
    productName: '',
  }
}

export function normalizeEinvoiceSyncFilter(input = {}, fallback = buildDefaultEinvoiceSyncFilter()) {
  const source = input && typeof input === 'object' ? input : {}
  const next = {
    dateFrom: normalizeDateInput(source.dateFrom) || normalizeDateInput(fallback.dateFrom) || buildDefaultEinvoiceSyncFilter().dateFrom,
    dateTo: normalizeDateInput(source.dateTo) || normalizeDateInput(fallback.dateTo) || buildDefaultEinvoiceSyncFilter().dateTo,
    carrier: normalizeText(source.carrier || fallback.carrier || 'all') || 'all',
    status: normalizeText(source.status || fallback.status || 'all') || 'all',
    buyerBan: normalizeText(source.buyerBan || fallback.buyerBan),
    productName: normalizeText(source.productName || fallback.productName),
  }

  if (next.dateFrom && next.dateTo && next.dateFrom > next.dateTo) {
    const swap = next.dateFrom
    next.dateFrom = next.dateTo
    next.dateTo = swap
  }

  return next
}

export function createEinvoiceInvoiceSourceKey(row = {}) {
  return [
    normalizeText(row.invoiceNumber),
    normalizeDateInput(row.invoiceDate),
    Math.round(Number(row.amountMinor ?? 0) || 0),
    normalizeText(row.sellerName),
    normalizeText(row.carrierLabel),
  ].join('|')
}

export function normalizeEinvoiceCarrierOptions(options = []) {
  if (!Array.isArray(options)) return []
  return options
    .map((item) => ({
      value: normalizeText(item?.value),
      label: normalizeText(item?.label),
    }))
    .filter((item) => item.value || item.label)
}

export function normalizeEinvoiceInvoiceRows(rows = [], selectedStatus = 'all') {
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => {
      const invoiceNumber = normalizeText(row.invoiceNumber)
      const invoiceDate = normalizeDateInput(row.invoiceDate)
      const amountMinor = Math.round(Number(row.amountMinor ?? 0) || 0)
      if (!invoiceNumber || !invoiceDate || !Number.isFinite(amountMinor)) return null
      const normalized = {
        invoiceNumber,
        invoiceDate,
        amountMinor,
        sellerName: normalizeText(row.sellerName),
        carrierLabel: normalizeText(row.carrierLabel),
        buyerBan: normalizeText(row.buyerBan),
        invoiceStatus: normalizeText(row.invoiceStatus || selectedStatus) || 'all',
        raw: row.raw && typeof row.raw === 'object' ? row.raw : {},
      }
      normalized.providerInvoiceKey = createEinvoiceInvoiceSourceKey(normalized)
      return normalized
    })
    .filter(Boolean)
}
