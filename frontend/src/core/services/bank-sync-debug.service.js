const BANK_SYNC_TRACE_MAX_ENTRIES = 60
const BANK_SYNC_CONSOLE_MAX_ENTRIES = 200
const BANK_SYNC_DEBUG_STORAGE_KEY = 'strawmoneybook.bankSync.debugEnabled'
const BANK_SYNC_CONSOLE_PREFIX = '[SMB:bank-sync]'
const REDACT_KEY_PATTERN = /(pass|pwd|secret|token|national|captcha|custid|usrid|usercode|cookie|authorization|session|vrfy)/i

const bankSyncTraceListeners = new Set()
const bankSyncConsoleListeners = new Set()
const bankSyncDebugModeListeners = new Set()
let bankSyncTraceSeq = 0
let bankSyncTraceEntries = []
let bankSyncConsoleEntries = []
let bankSyncConsoleSeq = 0
let debugEnvOverrideForTest = null
let runtimeToggleMemory = false

function normalizeText(value) {
  return String(value ?? '').trim()
}

function parseBooleanFlag(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

function readImportMetaEnv() {
  try {
    return import.meta.env ?? {}
  } catch {
    return {}
  }
}

export function isBankSyncDebugEnabledFromEnv(env = {}) {
  const mode = String(env.MODE ?? '').trim().toLowerCase()
  if (mode === 'debug' || mode === 'development') return true
  if (env.DEV === true || parseBooleanFlag(env.DEV)) return true
  return parseBooleanFlag(env.VITE_BANK_SYNC_DEBUG)
}

function readRuntimeDebugToggle() {
  try {
    if (typeof localStorage === 'undefined') return runtimeToggleMemory
    return parseBooleanFlag(localStorage.getItem(BANK_SYNC_DEBUG_STORAGE_KEY))
  } catch {
    return runtimeToggleMemory
  }
}

function writeRuntimeDebugToggle(enabled) {
  runtimeToggleMemory = Boolean(enabled)
  try {
    if (typeof localStorage === 'undefined') return
    if (enabled) localStorage.setItem(BANK_SYNC_DEBUG_STORAGE_KEY, '1')
    else localStorage.removeItem(BANK_SYNC_DEBUG_STORAGE_KEY)
  } catch {
    // Ignore quota / private-mode failures; in-memory flag still works.
  }
}

export function isBankSyncDebugEnvForced(env = debugEnvOverrideForTest ?? readImportMetaEnv()) {
  return isBankSyncDebugEnabledFromEnv(env)
}

export function isBankSyncDebugEnabled(env = debugEnvOverrideForTest ?? readImportMetaEnv()) {
  return isBankSyncDebugEnvForced(env) || readRuntimeDebugToggle()
}

export function resolveBankSyncDebugWebOpen({
  nativeRuntimeSupported = false,
  debugEnabled = isBankSyncDebugEnabled(),
} = {}) {
  return Boolean(debugEnabled) || Boolean(nativeRuntimeSupported)
}

function notifyDebugModeListeners() {
  const enabled = isBankSyncDebugEnabled()
  const envForced = isBankSyncDebugEnvForced()
  for (const listener of bankSyncDebugModeListeners) {
    try {
      listener({ enabled, envForced })
    } catch {
      // Ignore listener errors.
    }
  }
}

export function setBankSyncDebugEnabled(enabled) {
  writeRuntimeDebugToggle(Boolean(enabled))
  notifyDebugModeListeners()
  logBankSyncAction('debug.mode', {
    enabled: isBankSyncDebugEnabled(),
    envForced: isBankSyncDebugEnvForced(),
    source: 'runtime_toggle',
  })
  return isBankSyncDebugEnabled()
}

export function subscribeBankSyncDebugMode(listener, { emitCurrent = true } = {}) {
  if (typeof listener !== 'function') return () => {}
  bankSyncDebugModeListeners.add(listener)
  if (emitCurrent) {
    try {
      listener({
        enabled: isBankSyncDebugEnabled(),
        envForced: isBankSyncDebugEnvForced(),
      })
    } catch {
      // Ignore listener errors.
    }
  }
  return () => {
    bankSyncDebugModeListeners.delete(listener)
  }
}

function sanitizeValue(key, value, depth = 0) {
  if (REDACT_KEY_PATTERN.test(String(key ?? ''))) return '[redacted]'
  if (value == null) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (depth >= 4) return '[truncated]'
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item, index) => sanitizeValue(index, item, depth + 1))
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).slice(0, 40).map(([entryKey, entryValue]) => (
        [entryKey, sanitizeValue(entryKey, entryValue, depth + 1)]
      )),
    )
  }
  return String(value)
}

export function sanitizeBankSyncLogDetails(details) {
  if (details == null) return null
  if (typeof details !== 'object') return sanitizeValue('value', details)
  return sanitizeValue('details', details)
}

function cloneConsoleEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  return {
    id: normalizeText(entry.id),
    at: normalizeText(entry.at),
    action: normalizeText(entry.action),
    details: entry.details && typeof entry.details === 'object'
      ? sanitizeBankSyncLogDetails(entry.details)
      : entry.details,
  }
}

function notifyConsoleListeners() {
  if (!bankSyncConsoleListeners.size) return
  const snapshot = getBankSyncConsoleLogSnapshot()
  for (const listener of bankSyncConsoleListeners) {
    try {
      listener(snapshot)
    } catch {
      // Ignore listener errors.
    }
  }
}

function writeConsoleLog(action, details) {
  const payload = details == null ? undefined : sanitizeBankSyncLogDetails(details)
  const entry = {
    id: `bank_sync_console_${Date.now()}_${bankSyncConsoleSeq++}`,
    at: new Date().toISOString(),
    action: normalizeText(action) || 'unknown',
    details: payload ?? null,
  }
  bankSyncConsoleEntries = [entry, ...bankSyncConsoleEntries]
  if (bankSyncConsoleEntries.length > BANK_SYNC_CONSOLE_MAX_ENTRIES) {
    bankSyncConsoleEntries = bankSyncConsoleEntries.slice(0, BANK_SYNC_CONSOLE_MAX_ENTRIES)
  }
  notifyConsoleListeners()
  if (typeof console === 'undefined' || typeof console.log !== 'function') return
  if (payload === undefined) {
    console.log(BANK_SYNC_CONSOLE_PREFIX, entry.action)
    return
  }
  console.log(BANK_SYNC_CONSOLE_PREFIX, entry.action, payload)
}

export function logBankSyncAction(action, details) {
  if (!isBankSyncDebugEnabled()) return
  writeConsoleLog(action, details)
}

export function getBankSyncConsoleLogSnapshot() {
  return bankSyncConsoleEntries.map(cloneConsoleEntry).filter(Boolean)
}

export function subscribeBankSyncConsoleLog(listener, { emitCurrent = true } = {}) {
  if (typeof listener !== 'function') return () => {}
  bankSyncConsoleListeners.add(listener)
  if (emitCurrent) {
    try {
      listener(getBankSyncConsoleLogSnapshot())
    } catch {
      // Ignore listener errors.
    }
  }
  return () => {
    bankSyncConsoleListeners.delete(listener)
  }
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
  logBankSyncAction('trace.native', {
    operation: entry.operation,
    nativeAction: normalized.action,
    debugHint: normalized.debugHint,
    debugLastStep: normalized.debugLastStep,
    errorCode: normalized.errorCode,
    errorMessage: normalized.errorMessage,
    steps: normalized.steps.map((step) => ({
      step: step.step,
      status: step.status,
      message: step.message,
    })),
  })
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
  logBankSyncAction('trace.begin', {
    operation: entry.operation,
    provider: entry.provider,
    ledgerId: entry.ledgerId,
    connectionId: entry.connectionId,
  })
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
  logBankSyncAction('trace.end', {
    operation: context.entry.operation,
    status: context.entry.status,
    durationMs: context.entry.durationMs,
    errorCode: context.entry.errorCode,
    errorMessage: context.entry.errorMessage,
    debugLastStep: context.entry.debugLastStep,
  })
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

export function setBankSyncDebugEnvForTest(env) {
  debugEnvOverrideForTest = env && typeof env === 'object' ? env : null
}

export function resetBankSyncDebugTraceForTest() {
  bankSyncTraceSeq = 0
  bankSyncTraceEntries = []
  bankSyncConsoleSeq = 0
  bankSyncConsoleEntries = []
  debugEnvOverrideForTest = null
  runtimeToggleMemory = false
  writeRuntimeDebugToggle(false)
  notifyTraceListeners()
  notifyConsoleListeners()
  notifyDebugModeListeners()
}
