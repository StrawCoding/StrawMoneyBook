export const INVOICE_CARRIER_PROVIDER_ID = 'einvoice_tw'

export function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

export function normalizeCarrierOptions(options = []) {
  if (!Array.isArray(options)) return []

  const seen = new Set()
  return options
    .map((item) => {
      const value = normalizeText(item?.value)
      const label = normalizeText(item?.label)
      if (!value || !label) return null
      const dedupeKey = `${value}::${label}`
      if (seen.has(dedupeKey)) return null
      seen.add(dedupeKey)
      return { value, label }
    })
    .filter(Boolean)
}

export function parseInvoiceDateText(value) {
  const text = normalizeText(value)
  if (!text) return ''

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

  const zhMatch = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
  if (!zhMatch) return ''

  const year = zhMatch[1]
  const month = zhMatch[2].padStart(2, '0')
  const day = zhMatch[3].padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatInvoiceDateRangeLabel(startDate, endDate) {
  const start = parseInvoiceDateText(startDate) || normalizeText(startDate)
  const end = parseInvoiceDateText(endDate) || normalizeText(endDate)
  if (!start || !end) return ''

  const [startYear, startMonth, startDay] = start.split('-')
  const [endYear, endMonth, endDay] = end.split('-')
  if (!startYear || !endYear) return ''
  return `${Number(startYear)}年${Number(startMonth)}月${Number(startDay)}日 ~ ${Number(endYear)}年${Number(endMonth)}月${Number(endDay)}日`
}

export function createInvoiceCarrierError(code, message, status = 400) {
  const error = new Error(message)
  error.code = normalizeText(code) || 'invoice_carrier_error'
  error.status = Number(status) || 400
  return error
}

export function simpleHash(input) {
  const source = String(input ?? '')
  let hash = 2166136261
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0).toString(36)
}
