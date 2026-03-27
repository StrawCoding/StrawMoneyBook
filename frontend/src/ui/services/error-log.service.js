import { Capacitor } from '@capacitor/core'

async function defaultUploadClientErrorLog(...args) {
  const mod = await import('../../services/shared-ledger/backend.js')
  return mod.uploadClientErrorLog(...args)
}

const DUPLICATE_WINDOW_MS = 30_000

const defaultDependencies = {
  uploadClientErrorLog: defaultUploadClientErrorLog,
}

const dependencies = { ...defaultDependencies }
const recentErrorFingerprints = new Map()

function normalizeText(value) {
  return String(value ?? '').trim()
}

function truncateText(value, maxLength = 600) {
  const text = String(value ?? '')
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`
}

function sanitizeDebugValue(value, depth = 0) {
  if (value == null) return null
  if (depth >= 4) {
    return truncateText(value, 240)
  }
  if (typeof value === 'string') {
    return truncateText(value, 600)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 30)
      .map((item) => sanitizeDebugValue(item, depth + 1))
      .filter((item) => item !== undefined)
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 30)
        .map(([key, entryValue]) => [key, sanitizeDebugValue(entryValue, depth + 1)])
        .filter(([, entryValue]) => entryValue !== undefined),
    )
  }
  return truncateText(value, 240)
}

function toError(value) {
  if (value instanceof Error) return value
  const message = normalizeText(value?.message ?? value) || 'unknown error'
  const error = new Error(message)
  const code = normalizeText(value?.code)
  if (code) {
    error.code = code
  }
  if (normalizeText(value?.stack)) {
    error.stack = String(value.stack)
  }
  return error
}

function buildFingerprint(error, context = {}) {
  return [
    normalizeText(error?.code),
    normalizeText(error?.message),
    normalizeText(error?.stack).slice(0, 240),
    normalizeText(context?.routePath),
    normalizeText(context?.source),
    normalizeText(context?.component),
    normalizeText(context?.info),
  ].join('|')
}

function shouldSkipAsDuplicate(fingerprint, nowMs = Date.now()) {
  if (!fingerprint) return false
  for (const [key, time] of recentErrorFingerprints.entries()) {
    if (nowMs - time > DUPLICATE_WINDOW_MS) {
      recentErrorFingerprints.delete(key)
    }
  }
  const lastSentAt = recentErrorFingerprints.get(fingerprint)
  if (lastSentAt && nowMs - lastSentAt < DUPLICATE_WINDOW_MS) {
    return true
  }
  recentErrorFingerprints.set(fingerprint, nowMs)
  return false
}

function buildPayload(error, context = {}) {
  const normalizedError = toError(error)
  const debug = sanitizeDebugValue(context.debug)
  return {
    code: normalizeText(normalizedError.code),
    message: normalizeText(normalizedError.message),
    stack: String(normalizedError.stack ?? ''),
    routePath: normalizeText(context.routePath || (typeof window !== 'undefined' ? window.location?.pathname : '')),
    platform: Capacitor.getPlatform(),
    appVersion: normalizeText(import.meta.env?.VITE_APP_VERSION),
    releaseChannel: normalizeText(import.meta.env?.MODE),
    userAgent: typeof navigator !== 'undefined' ? normalizeText(navigator.userAgent) : '',
    context: {
      source: normalizeText(context.source),
      component: normalizeText(context.component),
      info: normalizeText(context.info),
      filename: normalizeText(context.filename),
      lineno: Number(context.lineno ?? 0) || 0,
      colno: Number(context.colno ?? 0) || 0,
      debug: debug && typeof debug === 'object' ? debug : null,
    },
  }
}

export function resetErrorLogServiceDependenciesForTest() {
  Object.assign(dependencies, defaultDependencies)
  recentErrorFingerprints.clear()
}

export function setErrorLogServiceDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

export async function logClientError(error, context = {}) {
  const payload = buildPayload(error, context)
  if (!payload.message) {
    return { skipped: 'empty' }
  }
  const fingerprint = buildFingerprint(error, context)
  if (shouldSkipAsDuplicate(fingerprint)) {
    return { skipped: 'duplicate' }
  }
  try {
    await dependencies.uploadClientErrorLog(payload)
    return { ok: true }
  } catch {
    return { skipped: 'upload_failed' }
  }
}

export function installGlobalErrorLogging(app, { router } = {}) {
  const resolveRoutePath = () => normalizeText(router?.currentRoute?.value?.fullPath || router?.currentRoute?.value?.path)
  const previousErrorHandler = app.config.errorHandler

  app.config.errorHandler = (error, instance, info) => {
    void logClientError(error, {
      source: 'vue',
      component: normalizeText(instance?.type?.name || instance?.type?.__name),
      info,
      routePath: resolveRoutePath(),
    })
    if (typeof previousErrorHandler === 'function') {
      previousErrorHandler(error, instance, info)
      return
    }
    console.error(error)
  }

  if (typeof window === 'undefined') {
    return () => {
      app.config.errorHandler = previousErrorHandler
    }
  }

  const onWindowError = (event) => {
    void logClientError(event?.error ?? event?.message ?? 'window error', {
      source: 'window',
      filename: event?.filename,
      lineno: event?.lineno,
      colno: event?.colno,
      routePath: resolveRoutePath(),
    })
  }

  const onUnhandledRejection = (event) => {
    const reason = event?.reason instanceof Error
      ? event.reason
      : new Error(normalizeText(event?.reason?.message ?? event?.reason) || 'unhandled rejection')
    void logClientError(reason, {
      source: 'promise',
      routePath: resolveRoutePath(),
    })
  }

  window.addEventListener('error', onWindowError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)

  return () => {
    app.config.errorHandler = previousErrorHandler
    window.removeEventListener('error', onWindowError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
