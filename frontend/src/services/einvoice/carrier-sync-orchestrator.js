import { Capacitor } from '@capacitor/core'
import {
  abortNativeCarrierSession,
  connectNativeCarrier,
  isCarrierAutomationRuntimeSupported,
  submitNativeCarrierCaptcha,
  syncNativeCarrier,
} from './native-automation.js'
import { getDefaultCarrierProviderId } from './provider-registry.js'
import {
  cancelEInvoiceScrapeSession,
  queryEInvoiceScrapeInvoices,
  startEInvoiceScrapeSession,
  submitEInvoiceScrapeCaptcha,
} from './scrape-api.js'
import { createEInvoiceError } from './shared.js'

const defaultDependencies = {}
const dependencies = { ...defaultDependencies }

/** Playwright / unit tests: mock native/scrape boundary without hitting real portal. */
export function setCarrierSyncOrchestratorDependenciesForTest(overrides = {}) {
  Object.assign(dependencies, overrides)
}

export function resetCarrierSyncOrchestratorDependenciesForTest() {
  for (const key of Object.keys(dependencies)) {
    if (!(key in defaultDependencies)) {
      delete dependencies[key]
    }
  }
  Object.assign(dependencies, defaultDependencies)
}

export function resolveCarrierSyncBackend() {
  return isCarrierAutomationRuntimeSupported() ? 'native' : 'scrape'
}

export function isCarrierSyncBackendReady({ apiConfigured = false } = {}) {
  if (isCarrierAutomationRuntimeSupported()) return true
  return Boolean(apiConfigured)
}

function buildNativeConnectionId(cardNo) {
  const normalized = String(cardNo ?? '').trim()
  return normalized ? `natgov_mobile_${normalized}` : ''
}

/**
 * Platform router: Android → CarrierAutomationPlugin; Web → backend Playwright scrape API.
 */
export async function fetchCarrierInvoices({
  cardNo,
  cardEncrypt,
  dateFrom,
  dateTo,
  captchaCode = '',
  sessionId = '',
  lastSyncAt = null,
  lookbackDays = 7,
} = {}) {
  if (typeof dependencies.fetchCarrierInvoicesForTest === 'function') {
    return dependencies.fetchCarrierInvoicesForTest({
      cardNo,
      cardEncrypt,
      dateFrom,
      dateTo,
      captchaCode,
      sessionId,
      lastSyncAt,
      lookbackDays,
    })
  }

  const backend = resolveCarrierSyncBackend()
  if (backend === 'native') {
    return fetchCarrierInvoicesNativeRoute({
      cardNo,
      cardEncrypt,
      dateFrom,
      dateTo,
      captchaCode,
      sessionId,
      lastSyncAt,
      lookbackDays,
    })
  }
  return fetchCarrierInvoicesScrapeRoute({
    cardNo,
    cardEncrypt,
    dateFrom,
    dateTo,
    captchaCode,
    sessionId,
  })
}

async function fetchCarrierInvoicesNativeRoute({
  cardNo,
  cardEncrypt,
  dateFrom,
  dateTo,
  captchaCode,
  sessionId,
  lastSyncAt,
  lookbackDays,
}) {
  const basePayload = {
    providerId: getDefaultCarrierProviderId(),
    cardNo,
    cardEncrypt,
    dateFrom,
    dateTo,
    lastSyncAt,
    lookbackDays,
    connectionId: buildNativeConnectionId(cardNo),
  }

  if (sessionId && captchaCode) {
    const submitted = await submitNativeCarrierCaptcha({
      ...basePayload,
      sessionId,
      captchaCode,
    })
    if (submitted.needsCaptcha) {
      const error = createEInvoiceError('請輸入圖形驗證碼', 'einvoice_captcha_required')
      error.sessionId = submitted.sessionId
      error.captchaImageBase64 = submitted.captchaImageBase64
      throw error
    }
    return submitted.invoices ?? []
  }

  try {
    const synced = await syncNativeCarrier(basePayload)
    return synced.invoices ?? []
  } catch (error) {
    if (error?.code === 'einvoice_captcha_required') throw error
    if (error?.code !== 'carrier_sync_credentials_missing' && error?.code !== 'einvoice_session_expired') {
      throw error
    }
  }

  const connected = await connectNativeCarrier(basePayload)
  if (connected.needsCaptcha && !captchaCode) {
    const error = createEInvoiceError('請輸入圖形驗證碼', 'einvoice_captcha_required')
    error.sessionId = connected.sessionId
    error.captchaImageBase64 = connected.captchaImageBase64
    throw error
  }

  const synced = await syncNativeCarrier(basePayload)
  return synced.invoices ?? []
}

async function fetchCarrierInvoicesScrapeRoute({
  cardNo,
  cardEncrypt,
  dateFrom,
  dateTo,
  captchaCode,
  sessionId,
}) {
  let activeSessionId = String(sessionId ?? '').trim()

  if (!activeSessionId) {
    const start = await startEInvoiceScrapeSession({
      cardNo,
      cardEncrypt: cardEncrypt,
      force_captcha: false,
    })
    activeSessionId = start.session_id
    if (start.needs_captcha && !captchaCode) {
      const error = createEInvoiceError('請輸入圖形驗證碼', 'einvoice_captcha_required')
      error.sessionId = activeSessionId
      error.captchaImageBase64 = start.captcha_image_base64 ?? ''
      throw error
    }
  }

  if (captchaCode) {
    await submitEInvoiceScrapeCaptcha({
      session_id: activeSessionId,
      captcha_code: captchaCode,
    })
  }

  return queryEInvoiceScrapeInvoices({
    session_id: activeSessionId,
    cardNo,
    cardEncrypt,
    startDate: dateFrom,
    endDate: dateTo,
    captcha_code: captchaCode || undefined,
  })
}

export async function cancelCarrierSyncBackendSession(sessionId = '') {
  if (!sessionId) return
  if (typeof dependencies.cancelCarrierSyncBackendSessionForTest === 'function') {
    await dependencies.cancelCarrierSyncBackendSessionForTest(sessionId)
    return
  }
  if (resolveCarrierSyncBackend() === 'native') {
    await abortNativeCarrierSession({ sessionId })
    return
  }
  await cancelEInvoiceScrapeSession({ session_id: sessionId })
}

export async function refreshCarrierCaptchaBackendSession({
  cardNo,
  cardEncrypt,
  previousSessionId = '',
} = {}) {
  if (typeof dependencies.refreshCarrierCaptchaBackendSessionForTest === 'function') {
    return dependencies.refreshCarrierCaptchaBackendSessionForTest({
      cardNo,
      cardEncrypt,
      previousSessionId,
    })
  }

  if (resolveCarrierSyncBackend() === 'native') {
    if (previousSessionId) {
      await abortNativeCarrierSession({ sessionId: previousSessionId }).catch(() => null)
    }
    const connected = await connectNativeCarrier({
      providerId: getDefaultCarrierProviderId(),
      cardNo,
      cardEncrypt,
      connectionId: buildNativeConnectionId(cardNo),
      forceCaptcha: true,
    })
    if (!connected.needsCaptcha) {
      return {
        sessionId: connected.sessionId ?? '',
        captchaImageBase64: '',
        needsCaptcha: false,
      }
    }
    return {
      sessionId: connected.sessionId,
      captchaImageBase64: connected.captchaImageBase64 ?? '',
      needsCaptcha: true,
    }
  }

  if (previousSessionId) {
    await cancelEInvoiceScrapeSession({ session_id: previousSessionId }).catch(() => null)
  }
  const start = await startEInvoiceScrapeSession({
    cardNo,
    cardEncrypt,
    force_captcha: true,
  })
  if (!start?.needs_captcha) {
    return {
      sessionId: start?.session_id ?? '',
      captchaImageBase64: '',
      needsCaptcha: false,
    }
  }
  return {
    sessionId: start.session_id,
    captchaImageBase64: start.captcha_image_base64 ?? '',
    needsCaptcha: true,
  }
}

export function getCarrierSyncSupportMatrix() {
  const platform = Capacitor.getPlatform()
  return {
    platform,
    androidNative: isCarrierAutomationRuntimeSupported(),
    webScrapeFallback: platform === 'web',
    defaultProviderId: getDefaultCarrierProviderId(),
    backend: resolveCarrierSyncBackend(),
  }
}
