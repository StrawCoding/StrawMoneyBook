import { translateMessage } from '../../ui/services/i18n.service.js'
import { normalizeEinvoiceCarrierOptions, normalizeEinvoiceInvoiceRows, normalizeEinvoiceSyncFilter } from './shared.js'
import {
  connectNativeEinvoiceCarrier,
  disconnectNativeEinvoiceCarrier,
  isNativeEinvoiceAutomationRuntimeSupported,
  syncNativeEinvoiceCarrier,
} from './native-automation.js'

const t = (key, fallback) => translateMessage(key, fallback)

const PROVIDERS_FALLBACK = [
  {
    id: 'tw_einvoice_mobile_barcode',
    name: '財政部電子發票整合服務平台',
    country: 'TW',
    authMode: 'mobile_barcode',
  },
]

function normalizeText(value) {
  return String(value ?? '').trim()
}

function createMissingEinvoiceApiError() {
  const message = isNativeEinvoiceAutomationRuntimeSupported()
    ? t('einvoice_carrier.error.api_unavailable_native', '目前無法啟動 Android App 內的發票載具同步流程')
    : t('einvoice_carrier.error.api_unavailable_web', '發票載具同步目前僅支援 Android App')
  const error = new Error(message)
  error.code = 'einvoice_api_unavailable'
  return error
}

function assertEinvoiceCarrierFeatureEnabled() {
  if (isNativeEinvoiceAutomationRuntimeSupported()) return
  throw createMissingEinvoiceApiError()
}

function createResponseInvalidError() {
  const error = new Error('發票載具同步回應格式錯誤')
  error.code = 'einvoice_response_invalid'
  return error
}

function mapNativeError(error) {
  const code = normalizeText(error?.code)
  const mappedCode = {
    einvoice_automation_android_only: 'einvoice_api_unavailable',
    einvoice_automation_unavailable: 'einvoice_api_unavailable',
    einvoice_automation_busy: 'einvoice_automation_busy',
    bank_automation_busy: 'einvoice_automation_busy',
    bank_automation_timeout: 'einvoice_automation_timeout',
    einvoice_captcha_not_ready: 'einvoice_captcha_ocr_failed',
    einvoice_captcha_refresh_missing: 'einvoice_captcha_ocr_failed',
    einvoice_login_trigger_missing: 'einvoice_login_failed',
    einvoice_query_button_not_found: 'einvoice_query_failed',
    einvoice_query_form_missing: 'einvoice_query_failed',
    einvoice_navigation_timeout: 'einvoice_query_failed',
  }[code] || code
  const mappedMessage = normalizeText(error?.message)
  const next = new Error(mappedMessage || createMissingEinvoiceApiError().message)
  next.code = mappedCode || 'einvoice_automation_failed'
  next.cause = error
  next.data = error?.data ?? null
  next.debugTrace = error?.debugTrace ?? null
  next.debugHint = normalizeText(error?.debugHint)
  next.debugLastStep = normalizeText(error?.debugLastStep)
  return next
}

export function isEinvoiceCarrierFeatureEnabled() {
  return listEinvoiceCarrierProviders().length > 0
}

export function isEinvoiceCarrierApiConfigured() {
  return isNativeEinvoiceAutomationRuntimeSupported()
}

export function getEinvoiceCarrierApiUnavailableMessage() {
  return createMissingEinvoiceApiError().message
}

export function listEinvoiceCarrierProviders() {
  return isNativeEinvoiceAutomationRuntimeSupported() ? PROVIDERS_FALLBACK.slice() : []
}

export async function createEinvoiceLinkSession(payload = {}) {
  assertEinvoiceCarrierFeatureEnabled()
  return {
    provider: normalizeText(payload.provider || 'tw_einvoice_mobile_barcode').toLowerCase(),
    auth_mode: normalizeText(payload.auth_mode || 'mobile_barcode').toLowerCase() || 'mobile_barcode',
    session_id: 'native_app_automation',
    compatibility_only: true,
  }
}

export async function exchangeEinvoiceAuth(payload = {}) {
  assertEinvoiceCarrierFeatureEnabled()
  try {
    const result = await connectNativeEinvoiceCarrier({
      provider: normalizeText(payload.provider || 'tw_einvoice_mobile_barcode').toLowerCase(),
      authMode: normalizeText(payload.auth_mode || 'mobile_barcode').toLowerCase() || 'mobile_barcode',
      mobilePhone: normalizeText(payload.mobile_phone),
      password: String(payload.password ?? ''),
    })
    if (!result || typeof result !== 'object') throw createResponseInvalidError()
    return {
      ...result,
      carrier_options: normalizeEinvoiceCarrierOptions(result.carrier_options),
    }
  } catch (error) {
    throw mapNativeError(error)
  }
}

export async function syncEinvoiceInvoices(payload = {}) {
  assertEinvoiceCarrierFeatureEnabled()
  try {
    const filter = normalizeEinvoiceSyncFilter(payload.filter)
    const result = await syncNativeEinvoiceCarrier({
      provider: normalizeText(payload.provider || 'tw_einvoice_mobile_barcode').toLowerCase(),
      authMode: normalizeText(payload.auth_mode || 'mobile_barcode').toLowerCase() || 'mobile_barcode',
      connectionId: normalizeText(payload.connection_id || payload.connectionId),
      sessionToken: normalizeText(payload.session_token || payload.access_token_ref),
      accessTokenRef: normalizeText(payload.access_token_ref || payload.session_token),
      filter,
    })
    if (!result || typeof result !== 'object') throw createResponseInvalidError()
    return {
      provider: normalizeText(result.provider || payload.provider || 'tw_einvoice_mobile_barcode').toLowerCase(),
      auth_mode: normalizeText(result.auth_mode || payload.auth_mode || 'mobile_barcode').toLowerCase() || 'mobile_barcode',
      sync_time: normalizeText(result.sync_time) || new Date().toISOString(),
      session_token: normalizeText(result.session_token || result.access_token_ref || payload.session_token || payload.access_token_ref),
      access_token_ref: normalizeText(result.access_token_ref || result.session_token || payload.access_token_ref || payload.session_token),
      carrier_options: normalizeEinvoiceCarrierOptions(result.carrier_options),
      filters_applied: filter,
      invoices: normalizeEinvoiceInvoiceRows(result.invoices, filter.status),
    }
  } catch (error) {
    throw mapNativeError(error)
  }
}

export async function disconnectEinvoiceAuth(payload = {}) {
  assertEinvoiceCarrierFeatureEnabled()
  try {
    return await disconnectNativeEinvoiceCarrier({
      provider: normalizeText(payload.provider || 'tw_einvoice_mobile_barcode').toLowerCase(),
      authMode: normalizeText(payload.auth_mode || 'mobile_barcode').toLowerCase() || 'mobile_barcode',
      connectionId: normalizeText(payload.connection_id || payload.connectionId),
      sessionToken: normalizeText(payload.session_token || payload.access_token_ref),
      accessTokenRef: normalizeText(payload.access_token_ref || payload.session_token),
    })
  } catch (error) {
    throw mapNativeError(error)
  }
}
