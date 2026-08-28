import { Capacitor, registerPlugin } from '@capacitor/core'
import { traceEInvoiceScrape } from '@/core/services/einvoice-debug.service.js'
import { normalizeInvoiceList } from './invoice-normalize.js'
import {
  getDefaultCarrierProviderId,
  isRegisteredCarrierProviderId,
} from './provider-registry.js'
import { createEInvoiceError } from './shared.js'

const CarrierAutomation = registerPlugin('CarrierAutomation')

function createNativeCarrierError(message, code = 'carrier_automation_error', data = null) {
  const error = new Error(String(message ?? '').trim() || 'Carrier automation error')
  error.code = String(code ?? '').trim() || 'carrier_automation_error'
  if (data && typeof data === 'object') {
    error.data = data
    error.debugTrace = data.debugTrace ?? null
    error.debugHint = String(data.debugTrace?.debugHint ?? '').trim()
    error.debugLastStep = String(data.debugTrace?.debugLastStep ?? '').trim()
  }
  return error
}

export function isCarrierAutomationRuntimeSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

/** @deprecated transitional alias */
export function isEInvoiceAutomationRuntimeSupported() {
  return isCarrierAutomationRuntimeSupported()
}

export async function ensureNativeCarrierAutomationAvailable() {
  if (!isCarrierAutomationRuntimeSupported()) {
    throw createNativeCarrierError('目前僅支援 Android App 的本地載具同步', 'carrier_automation_android_only')
  }
  try {
    const result = await CarrierAutomation.isAvailable()
    if (!result?.available) {
      throw createNativeCarrierError('Carrier automation is unavailable', 'carrier_automation_unavailable')
    }
    return result
  } catch (error) {
    if (error instanceof Error && error.code) throw error
    throw createNativeCarrierError(
      error?.message || error,
      error?.code || 'carrier_automation_unavailable',
      error?.data,
    )
  }
}

function normalizePluginError(error, fallbackMessage) {
  const code = String(error?.code ?? '').trim() || 'carrier_automation_failed'
  const normalized = createNativeCarrierError(
    String(error?.message ?? fallbackMessage ?? 'Carrier automation failed'),
    code,
    error?.data,
  )
  const errorData = error?.data?.errorData ?? error?.data
  if (errorData && typeof errorData === 'object') {
    normalized.data = errorData
    normalized.captchaImageBase64 = String(
      errorData.captchaImageBase64 ?? errorData.captcha_image_base64 ?? '',
    ).trim()
    normalized.sessionId = String(errorData.sessionId ?? errorData.session_id ?? '').trim()
  }
  if (code === 'einvoice_captcha_required') {
    normalized.sessionId = normalized.sessionId || String(error?.data?.sessionId ?? '').trim()
    normalized.captchaImageBase64 = normalized.captchaImageBase64
      || String(error?.data?.captchaImageBase64 ?? '').trim()
  }
  return normalized
}

function withProviderId(payload = {}) {
  const providerId = String(payload?.providerId ?? payload?.provider ?? getDefaultCarrierProviderId()).trim().toLowerCase()
  return {
    ...payload,
    providerId,
    provider: providerId || payload?.provider,
  }
}

function mapNativeResult(result = {}) {
  const invoices = normalizeInvoiceList(Array.isArray(result?.invoices) ? result.invoices : [])
  return {
    ...result,
    invoices,
    sessionId: String(result?.sessionId ?? result?.session_id ?? '').trim(),
    captchaImageBase64: String(result?.captchaImageBase64 ?? result?.captcha_image_base64 ?? '').trim(),
    needsCaptcha: Boolean(result?.needsCaptcha ?? result?.needs_captcha),
  }
}

export async function connectNativeCarrier(payload = {}) {
  await ensureNativeCarrierAutomationAvailable()
  const next = withProviderId(payload)
  if (!isRegisteredCarrierProviderId(next.providerId)) {
    throw createNativeCarrierError('Unsupported carrier provider', 'carrier_provider_unsupported')
  }
  try {
    return mapNativeResult(await CarrierAutomation.connectCarrier(next))
  } catch (error) {
    const normalized = normalizePluginError(error, 'Carrier connect failed')
    if (normalized.code === 'einvoice_captcha_required') {
      throw normalized
    }
    throw normalized
  }
}

export async function syncNativeCarrier(payload = {}) {
  await ensureNativeCarrierAutomationAvailable()
  const next = withProviderId(payload)
  if (!isRegisteredCarrierProviderId(next.providerId)) {
    throw createNativeCarrierError('Unsupported carrier provider', 'carrier_provider_unsupported')
  }
  try {
    return mapNativeResult(await CarrierAutomation.syncCarrier(next))
  } catch (error) {
    throw normalizePluginError(error, 'Carrier sync failed')
  }
}

export async function disconnectNativeCarrier(payload = {}) {
  await ensureNativeCarrierAutomationAvailable()
  const next = withProviderId(payload)
  try {
    return await CarrierAutomation.disconnectCarrier(next)
  } catch (error) {
    throw normalizePluginError(error, 'Carrier disconnect failed')
  }
}

export async function submitNativeCarrierCaptcha(payload = {}) {
  await ensureNativeCarrierAutomationAvailable()
  const next = withProviderId(payload)
  try {
    return mapNativeResult(await CarrierAutomation.submitCaptcha(next))
  } catch (error) {
    throw normalizePluginError(error, 'Carrier captcha submit failed')
  }
}

export async function abortNativeCarrierSession(payload = {}) {
  if (!isCarrierAutomationRuntimeSupported()) return { ok: true }
  try {
    return await CarrierAutomation.abortCarrier(payload)
  } catch {
    return { ok: false }
  }
}

/** Kept for stale imports — routes to native sync on Android. */
export async function queryNativeEInvoices(payload = {}) {
  const result = await syncNativeCarrier(payload)
  return result.invoices ?? []
}

export async function fetchCarrierInvoicesNative({
  cardNo,
  cardEncrypt,
  dateFrom,
  dateTo,
  captchaCode = '',
  sessionId = '',
  lastSyncAt = null,
  lookbackDays = 7,
} = {}) {
  return traceEInvoiceScrape(
    { carrierBarcode: cardNo, dateFrom, dateTo, operation: 'native_sync' },
    async () => {
      const basePayload = {
        cardNo,
        cardEncrypt,
        dateFrom,
        dateTo,
        lastSyncAt,
        lookbackDays,
        captchaCode,
        sessionId,
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
        if (error?.code !== 'carrier_sync_credentials_missing' && error?.code !== 'einvoice_session_expired') {
          if (error?.code === 'einvoice_captcha_required') throw error
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
    },
  )
}
