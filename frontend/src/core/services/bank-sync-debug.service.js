const BANK_SYNC_TRACE_MAX_ENTRIES = 60
const bankSyncTraceListeners = new Set()
let bankSyncTraceSeq = 0
let bankSyncTraceEntries = []

function normalizeText(value) {
  return String(value ?? '').trim()
}

function cloneStep(step) {
  if (!step || typeof step !== 'object') return null
  const details = step.details && typeof step.details === 'object'
    ? Object.fromEntries(Object.entries(step.details).map(([key, value]) => [key, value]))
    : null
  return {
    step: normalizeText(step.step),
    status: normalizeText(step.status),
    message: normalizeText(step.message),
    at: Number(step.at ?? 0) || 0,
    details,
  }
}

function normalizeDebugTrace(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    action: normalizeText(source.action),
    debugHint: normalizeText(source.debugHint),
    debugLastStep: normalizeText(source.debugLastStep),
    errorCode: normalizeText(source.errorCode),
    errorMessage: normalizeText(source.errorMessage),
    steps: Array.isArray(source.steps) ? source.steps.map(cloneStep).filter(Boolean) : [],
  }
}

function cloneBankSyncTraceEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  return {
    id: normalizeText(entry.id),
    operation: normalizeText(entry.operation),
    provider: normalizeText(entry.provider),
    ledgerId: normalizeText(entry.ledgerId),
    connectionId: normalizeText(entry.connectionId),
    startedAt: normalizeText(entry.startedAt),
    endedAt: normalizeText(entry.endedAt),
    durationMs: Number(entry.durationMs ?? 0) || 0,
    status: normalizeText(entry.status),
    errorCode: normalizeText(entry.errorCode),
    errorMessage: normalizeText(entry.errorMessage),
    debugHint: normalizeText(entry.debugHint),
    debugLastStep: normalizeText(entry.debugLastStep),
    nativeAction: normalizeText(entry.nativeAction),
    steps: Array.isArray(entry.steps) ? entry.steps.map(cloneStep).filter(Boolean) : [],
  }
}

function trimTraceEntries() {
  if (bankSyncTraceEntries.length <= BANK_SYNC_TRACE_MAX_ENTRIES) return
  bankSyncTraceEntries = bankSyncTraceEntries.slice(0, BANK_SYNC_TRACE_MAX_ENTRIES)
}

function notifyTraceListeners() {
  if (!bankSyncTraceListeners.size) return
  const snapshot = getBankSyncDebugTraceSnapshot()
  for (const listener of bankSyncTraceListeners) {
    try {
      listener(snapshot)
    } catch {
      // Ignore listener errors.
    }
  }
}

function applyNativeDebugTrace(entry, debugTrace) {
  const normalized = normalizeDebugTrace(debugTrace)
  entry.debugHint = normalized.debugHint
  entry.debugLastStep = normalized.debugLastStep
  entry.nativeAction = normalized.action
  if (normalized.errorCode) entry.errorCode = normalized.errorCode
  if (normalized.errorMessage) entry.errorMessage = normalized.errorMessage
  entry.steps = normalized.steps
}

function beginBankSyncTrace(operation, meta = {}) {
  const nowMs = Date.now()
  const entry = {
    id: `bank_sync_trace_${nowMs}_${bankSyncTraceSeq++}`,
    operation: normalizeText(operation) || 'unknown',
    provider: normalizeText(meta.provider),
    ledgerId: normalizeText(meta.ledgerId),
    connectionId: normalizeText(meta.connectionId),
    startedAt: new Date(nowMs).toISOString(),
    endedAt: '',
    durationMs: 0,
    status: 'running',
    errorCode: '',
    errorMessage: '',
    debugHint: '',
    debugLastStep: '',
    nativeAction: '',
    steps: [],
  }
  bankSyncTraceEntries = [entry, ...bankSyncTraceEntries]
  trimTraceEntries()
  notifyTraceListeners()
  return {
    entry,
    startedAtMs: nowMs,
    attachDebugTrace(debugTrace) {
      applyNativeDebugTrace(entry, debugTrace)
      notifyTraceListeners()
    },
  }
}

function endBankSyncTrace(context, { status, error = null } = {}) {
  if (!context?.entry) return
  const endedAtMs = Date.now()
  context.entry.endedAt = new Date(endedAtMs).toISOString()
  context.entry.durationMs = Math.max(0, endedAtMs - Number(context.startedAtMs || endedAtMs))
  context.entry.status = status === 'ok' ? 'ok' : 'error'
  if (error) {
    context.entry.errorCode = normalizeText(error.code).toUpperCase()
    context.entry.errorMessage = normalizeText(error.message || error)
    if (error?.debugTrace) {
      applyNativeDebugTrace(context.entry, error.debugTrace)
    }
    if (error?.debugHint) {
      context.entry.debugHint = normalizeText(error.debugHint)
    }
    if (error?.debugLastStep) {
      context.entry.debugLastStep = normalizeText(error.debugLastStep)
    }
  }
  notifyTraceListeners()
}

export async function traceBankSyncOperation(operation, meta = {}, task) {
  const context = beginBankSyncTrace(operation, meta)
  try {
    const result = await task(context)
    endBankSyncTrace(context, { status: 'ok' })
    return result
  } catch (error) {
    endBankSyncTrace(context, { status: 'error', error })
    throw error
  }
}

export function getBankSyncDebugTraceSnapshot() {
  return bankSyncTraceEntries.map(cloneBankSyncTraceEntry).filter(Boolean)
}

export function subscribeBankSyncDebugTrace(listener, { emitCurrent = true } = {}) {
  if (typeof listener !== 'function') {
    return () => {}
  }
  bankSyncTraceListeners.add(listener)
  if (emitCurrent) {
    try {
      listener(getBankSyncDebugTraceSnapshot())
    } catch {
      // Ignore listener errors.
    }
  }
  return () => {
    bankSyncTraceListeners.delete(listener)
  }
}

export function resetBankSyncDebugTraceForTest() {
  bankSyncTraceSeq = 0
  bankSyncTraceEntries = []
  notifyTraceListeners()
}
