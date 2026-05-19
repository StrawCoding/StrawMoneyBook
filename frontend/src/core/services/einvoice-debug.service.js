const EINVOICE_TRACE_MAX_ENTRIES = 30
const einvoiceTraceListeners = new Set()
let einvoiceTraceSeq = 0
let einvoiceTraceEntries = []

function normalizeText(value) {
  return String(value ?? '').trim()
}

function maskCarrierBarcode(carrierBarcode) {
  const barcode = normalizeText(carrierBarcode)
  if (barcode.length < 4) return barcode
  return barcode.slice(0, 4) + '****'
}

function cloneEInvoiceTraceEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  return {
    id: normalizeText(entry.id),
    operation: normalizeText(entry.operation),
    maskedCarrierBarcode: normalizeText(entry.maskedCarrierBarcode),
    dateFrom: normalizeText(entry.dateFrom),
    dateTo: normalizeText(entry.dateTo),
    startedAt: normalizeText(entry.startedAt),
    endedAt: normalizeText(entry.endedAt),
    durationMs: Number(entry.durationMs ?? 0) || 0,
    status: normalizeText(entry.status),
    errorCode: normalizeText(entry.errorCode),
    errorMessage: normalizeText(entry.errorMessage),
    invoiceCount: Number(entry.invoiceCount ?? -1),
    importedCount: Number(entry.importedCount ?? -1),
    skippedCount: Number(entry.skippedCount ?? -1),
    failedCount: Number(entry.failedCount ?? -1),
  }
}

function trimTraceEntries() {
  if (einvoiceTraceEntries.length <= EINVOICE_TRACE_MAX_ENTRIES) return
  einvoiceTraceEntries = einvoiceTraceEntries.slice(0, EINVOICE_TRACE_MAX_ENTRIES)
}

function notifyTraceListeners() {
  if (!einvoiceTraceListeners.size) return
  const snapshot = getEInvoiceDebugTraceSnapshot()
  for (const listener of einvoiceTraceListeners) {
    try {
      listener(snapshot)
    } catch {
      // Ignore listener errors.
    }
  }
}

function beginEInvoiceTrace(operation, meta = {}) {
  const nowMs = Date.now()
  const entry = {
    id: `einvoice_trace_${nowMs}_${einvoiceTraceSeq++}`,
    operation: normalizeText(operation) || 'unknown',
    maskedCarrierBarcode: maskCarrierBarcode(meta.carrierBarcode),
    dateFrom: normalizeText(meta.dateFrom),
    dateTo: normalizeText(meta.dateTo),
    startedAt: new Date(nowMs).toISOString(),
    endedAt: '',
    durationMs: 0,
    status: 'running',
    errorCode: '',
    errorMessage: '',
    invoiceCount: -1,
    importedCount: -1,
    skippedCount: -1,
    failedCount: -1,
  }
  einvoiceTraceEntries = [entry, ...einvoiceTraceEntries]
  trimTraceEntries()
  notifyTraceListeners()
  return { entry, startedAtMs: nowMs }
}

function endEInvoiceTrace(context, { status, error = null, counts = {} } = {}) {
  if (!context?.entry) return
  const endedAtMs = Date.now()
  context.entry.endedAt = new Date(endedAtMs).toISOString()
  context.entry.durationMs = Math.max(0, endedAtMs - Number(context.startedAtMs || endedAtMs))
  context.entry.status = status === 'ok' ? 'ok' : 'error'
  if (counts.invoiceCount !== undefined) context.entry.invoiceCount = Number(counts.invoiceCount)
  if (counts.importedCount !== undefined) context.entry.importedCount = Number(counts.importedCount)
  if (counts.skippedCount !== undefined) context.entry.skippedCount = Number(counts.skippedCount)
  if (counts.failedCount !== undefined) context.entry.failedCount = Number(counts.failedCount)
  if (error) {
    context.entry.errorCode = normalizeText(error.code)
    context.entry.errorMessage = normalizeText(error.message || error)
  }
  notifyTraceListeners()
}

export async function traceEInvoiceScrape(meta, task) {
  const context = beginEInvoiceTrace('scrape', meta)
  try {
    const result = await task()
    endEInvoiceTrace(context, {
      status: 'ok',
      counts: { invoiceCount: Array.isArray(result) ? result.length : 0 },
    })
    return result
  } catch (error) {
    endEInvoiceTrace(context, { status: 'error', error })
    throw error
  }
}

export async function traceEInvoiceImport(task) {
  const context = beginEInvoiceTrace('import')
  try {
    const result = await task()
    endEInvoiceTrace(context, {
      status: 'ok',
      counts: {
        importedCount: result?.imported?.length ?? 0,
        skippedCount: result?.skipped?.length ?? 0,
        failedCount: result?.failed?.length ?? 0,
      },
    })
    return result
  } catch (error) {
    endEInvoiceTrace(context, { status: 'error', error })
    throw error
  }
}

export function getEInvoiceDebugTraceSnapshot() {
  return einvoiceTraceEntries.map(cloneEInvoiceTraceEntry).filter(Boolean)
}

export function subscribeEInvoiceDebugTrace(listener, { emitCurrent = true } = {}) {
  if (typeof listener !== 'function') return () => {}
  einvoiceTraceListeners.add(listener)
  if (emitCurrent) {
    try {
      listener(getEInvoiceDebugTraceSnapshot())
    } catch {
      // Ignore listener errors.
    }
  }
  return () => {
    einvoiceTraceListeners.delete(listener)
  }
}

export function resetEInvoiceDebugTraceForTest() {
  einvoiceTraceSeq = 0
  einvoiceTraceEntries = []
  notifyTraceListeners()
}
