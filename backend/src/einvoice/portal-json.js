import { MAX_QUERY_DAYS, parseInputDate } from './validation.js'

const INVOICE_NUMBER_RE = /^[A-Z]{2}\d{8}$/

function formatIsoDate(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isInvoiceLikeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const number = String(
    value.invoiceNumber
    ?? value.invNum
    ?? value.invoice_no
    ?? value.invNo
    ?? '',
  ).trim()
  if (!INVOICE_NUMBER_RE.test(number)) return false
  return true
}

function normalizeRawInvoice(item) {
  const invoiceNumber = String(
    item.invoiceNumber
    ?? item.invNum
    ?? item.invoice_no
    ?? item.invNo
    ?? '',
  ).trim()
  const amount = item.amount ?? item.invAmount ?? item.totalAmount ?? item.invoiceAmount ?? '0'
  const dateRaw = item.invoiceDate ?? item.invDate ?? item.invoice_date ?? item.date ?? ''
  return {
    invoiceNumber,
    amount,
    invDate: dateRaw,
    sellerName: String(item.sellerName ?? item.merchantName ?? item.seller_name ?? '').trim(),
    carrierName: String(item.carrierName ?? '手機條碼').trim() || '手機條碼',
    invStatus: String(item.invStatus ?? item.status ?? '').trim() || undefined,
  }
}

export function collectInvoiceCandidates(node, bucket = []) {
  if (node == null) return bucket

  if (Array.isArray(node)) {
    for (const item of node) collectInvoiceCandidates(item, bucket)
    return bucket
  }

  if (typeof node !== 'object') return bucket

  if (isInvoiceLikeObject(node)) {
    bucket.push(normalizeRawInvoice(node))
    return bucket
  }

  for (const value of Object.values(node)) {
    collectInvoiceCandidates(value, bucket)
  }
  return bucket
}

export function extractInvoicesFromJsonPayloads(payloads = []) {
  const bucket = []
  for (const payload of payloads) {
    collectInvoiceCandidates(payload, bucket)
  }
  return bucket
}

export function splitQueryDateRange(startDate, endDate, maxDays = MAX_QUERY_DAYS) {
  const from = parseInputDate(startDate)
  const to = parseInputDate(endDate)
  if (!from || !to || to.getTime() < from.getTime()) return []

  const windows = []
  let cursor = new Date(from.getTime())

  while (cursor.getTime() <= to.getTime()) {
    const windowEnd = new Date(cursor.getTime())
    windowEnd.setUTCDate(windowEnd.getUTCDate() + maxDays - 1)
    if (windowEnd.getTime() > to.getTime()) {
      windowEnd.setTime(to.getTime())
    }
    windows.push({
      startDate: formatIsoDate(cursor),
      endDate: formatIsoDate(windowEnd),
    })
    const next = new Date(windowEnd.getTime())
    next.setUTCDate(next.getUTCDate() + 1)
    cursor = next
  }

  return windows
}

export function splitQueryDateRangeByMonth(startDate, endDate) {
  const from = parseInputDate(startDate)
  const to = parseInputDate(endDate)
  if (!from || !to || to.getTime() < from.getTime()) return []

  const windows = []
  let cursor = new Date(from.getTime())

  while (cursor.getTime() <= to.getTime()) {
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0))
    const windowEnd = monthEnd.getTime() > to.getTime() ? to : monthEnd
    windows.push({
      startDate: formatIsoDate(cursor),
      endDate: formatIsoDate(windowEnd),
    })
    const next = new Date(windowEnd.getTime())
    next.setUTCDate(next.getUTCDate() + 1)
    cursor = next
  }

  return windows
}

export function mergeQueryWindows(startDate, endDate, maxDays = MAX_QUERY_DAYS) {
  const byMonth = splitQueryDateRangeByMonth(startDate, endDate)
  const merged = []

  for (const window of byMonth) {
    const chunks = splitQueryDateRange(window.startDate, window.endDate, maxDays)
    merged.push(...chunks)
  }

  return merged.length > 0 ? merged : splitQueryDateRange(startDate, endDate, maxDays)
}
