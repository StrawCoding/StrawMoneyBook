import { Capacitor } from '@capacitor/core'
import { translateMessage } from '../../ui/services/i18n.service.js'
import {
  createNativeInvoiceCarrierLinkSession,
  disconnectNativeInvoiceCarrierSession,
  exchangeNativeInvoiceCarrierAuth,
  getNativeInvoiceCarrierSessionStatus,
  isNativeInvoiceCarrierAutomationRuntimeSupported,
  syncNativeInvoiceCarrierData,
} from './native-automation.js'

export { isNativeInvoiceCarrierAutomationRuntimeSupported }

const IMPORT_META_ENV = import.meta.env ?? {}
const PROD_DEFAULT_INVOICE_CARRIER_API_BASE = 'https://api.strawmb.com'
const INVOICE_CARRIER_FEATURE_ENABLED = true
const t = (key, params, fallback) => translateMessage(key, params, fallback)

function normalizeText(value) {
  return String(value ?? '').trim()
}

function isLocalInvoiceApiWebOrigin(origin) {
  return /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(origin)
}

export function shouldUseSameOriginLocalInvoiceApi({
  env = IMPORT_META_ENV,
  platform = Capacitor.getPlatform(),
  windowRef = typeof window === 'undefined' ? null : window,
} = {}) {
  if (normalizeText(env?.VITE_INVOICE_CARRIER_API_BASE_URL)) return false
  if (platform !== 'web') return false
  const origin = normalizeText(windowRef?.location?.origin)
  return isLocalInvoiceApiWebOrigin(origin)
}

export function resolveInvoiceCarrierApiBase({
  env = IMPORT_META_ENV,
  platform = Capacitor.getPlatform(),
  windowRef = typeof window === 'undefined' ? null : window,
} = {}) {
  const explicitInvoiceApiBase = normalizeText(env?.VITE_INVOICE_CARRIER_API_BASE_URL)
  if (explicitInvoiceApiBase) return explicitInvoiceApiBase

  if (shouldUseSameOriginLocalInvoiceApi({ env, platform, windowRef })) {
    return ''
  }

  if (platform !== 'web') {
    return PROD_DEFAULT_INVOICE_CARRIER_API_BASE
  }

  if (Boolean(env?.PROD)) {
    return PROD_DEFAULT_INVOICE_CARRIER_API_BASE
  }

  return ''
}

export function resolveInvoiceCarrierClientSharedKey(env = IMPORT_META_ENV) {
  return normalizeText(
    env?.VITE_INVOICE_CARRIER_CLIENT_SHARED_KEY
      ?? env?.VITE_BANK_SYNC_CLIENT_SHARED_KEY
      ?? '',
  )
}

function buildApiUrl(path, options) {
  const normalizedPath = String(path ?? '').trim()
  if (!normalizedPath.startsWith('/')) {
    throw new Error(`invalid invoice carrier api path: ${normalizedPath}`)
  }
  const apiBase = resolveInvoiceCarrierApiBase(options)
  if (!apiBase) return normalizedPath
  return `${apiBase.replace(/\/$/, '')}${normalizedPath}`
}

function shouldRequireExplicitApiBase(options) {
  if (resolveInvoiceCarrierApiBase(options)) return false
  return !shouldUseSameOriginLocalInvoiceApi(options)
}

function createMissingInvoiceCarrierApiError(platform = Capacitor.getPlatform()) {
  const message = platform === 'web'
    ? t('invoice_carrier.error.api_unavailable_web', null, '電子發票載具 API 未設定，請部署 /api/invoice，並確保該 host 能啟動 headed Playwright browser')
    : t('invoice_carrier.error.api_unavailable_native', null, '手機 App 需設定電子發票載具 API URL；若未指定，預設 host 也必須已部署 /api/invoice 並能啟動 headed Playwright browser')
  const error = new Error(message)
  error.code = 'invoice_carrier_api_unavailable'
  return error
}

function isLikelyHtmlResponse(text) {
  return /^\s*<!doctype html/i.test(String(text ?? ''))
    || /^\s*<html[\s>]/i.test(String(text ?? ''))
}

function createInvoiceCarrierDisabledError() {
  const error = new Error('電子發票載具功能目前未開放')
  error.code = 'invoice_carrier_feature_disabled'
  return error
}

function assertInvoiceCarrierFeatureEnabled() {
  if (INVOICE_CARRIER_FEATURE_ENABLED) return
  throw createInvoiceCarrierDisabledError()
}

async function postJson(path, payload = {}) {
  assertInvoiceCarrierFeatureEnabled()
  const platform = Capacitor.getPlatform()
  const requestOptions = {
    platform,
    windowRef: typeof window === 'undefined' ? null : window,
  }

  if (shouldRequireExplicitApiBase(requestOptions)) {
    throw createMissingInvoiceCarrierApiError(platform)
  }

  const headers = {
    'Content-Type': 'application/json',
  }
  const clientSharedKey = resolveInvoiceCarrierClientSharedKey()
  if (clientSharedKey) {
    headers['X-Straw-Client-Key'] = clientSharedKey
  }

  let response = null
  try {
    response = await fetch(buildApiUrl(path, requestOptions), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload ?? {}),
    })
  } catch (error) {
    const apiError = createMissingInvoiceCarrierApiError(platform)
    apiError.cause = error
    throw apiError
  }

  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    if (
      path.startsWith('/api/invoice/')
      && (
        response.status === 404
        || isLikelyHtmlResponse(text)
        || (data?.error === 'not_found' && /route not found/i.test(String(data?.message ?? '')))
      )
    ) {
      throw createMissingInvoiceCarrierApiError(platform)
    }
    const message = String(data?.message ?? data?.error ?? text ?? '').trim() || `HTTP ${response.status}`
    const error = new Error(message)
    error.code = String(data?.error ?? '').trim() || 'invoice_carrier_http_error'
    error.status = response.status
    throw error
  }

  if (!data || typeof data !== 'object') {
    if (isLikelyHtmlResponse(text)) {
      throw createMissingInvoiceCarrierApiError(platform)
    }
    const error = new Error(t('invoice_carrier.error.response_invalid', null, '電子發票載具後端回應格式錯誤'))
    error.code = 'invoice_carrier_response_invalid'
    throw error
  }

  return data
}

export function isInvoiceCarrierApiConfiguredFor(options = {}) {
  if (!INVOICE_CARRIER_FEATURE_ENABLED) return false
  if (options?.platform === 'android') return true
  if (!options?.platform && isNativeInvoiceCarrierAutomationRuntimeSupported()) return true
  return !shouldRequireExplicitApiBase(options)
}

export function isInvoiceCarrierApiConfigured() {
  return isInvoiceCarrierApiConfiguredFor()
}

export function isInvoiceCarrierLinkingSupportedFor({
  platform = Capacitor.getPlatform(),
} = {}) {
  if (!INVOICE_CARRIER_FEATURE_ENABLED) return false
  if (platform === 'web') return true
  return platform === 'android'
}

export function isInvoiceCarrierLinkingSupported() {
  return isInvoiceCarrierLinkingSupportedFor()
}

export function isInvoiceCarrierFeatureEnabled() {
  return INVOICE_CARRIER_FEATURE_ENABLED
}

export function getInvoiceCarrierApiUnavailableMessage() {
  if (!INVOICE_CARRIER_FEATURE_ENABLED) {
    return createInvoiceCarrierDisabledError().message
  }
  return createMissingInvoiceCarrierApiError(Capacitor.getPlatform()).message
}

export function getInvoiceCarrierLinkingUnavailableMessage() {
  return t(
    'invoice_carrier.error.native_linking_unavailable',
    null,
    '目前僅支援 Web 與 Android App 新增或重新驗證電子發票載具。',
  )
}

export async function createInvoiceCarrierLinkSession(payload = {}) {
  if (isNativeInvoiceCarrierAutomationRuntimeSupported()) {
    return createNativeInvoiceCarrierLinkSession(payload)
  }
  return postJson('/api/invoice/link_session', payload)
}

export async function getInvoiceCarrierSessionStatus(payload = {}) {
  if (isNativeInvoiceCarrierAutomationRuntimeSupported()) {
    return getNativeInvoiceCarrierSessionStatus(payload)
  }
  return postJson('/api/invoice/session_status', payload)
}

export async function exchangeInvoiceCarrierAuth(payload = {}) {
  if (isNativeInvoiceCarrierAutomationRuntimeSupported()) {
    return exchangeNativeInvoiceCarrierAuth(payload)
  }
  return postJson('/api/invoice/exchange', payload)
}

export async function syncInvoiceCarrierData(payload = {}) {
  if (isNativeInvoiceCarrierAutomationRuntimeSupported()) {
    return syncNativeInvoiceCarrierData(payload)
  }
  return postJson('/api/invoice/sync', payload)
}

export async function disconnectInvoiceCarrierSession(payload = {}) {
  if (isNativeInvoiceCarrierAutomationRuntimeSupported()) {
    return disconnectNativeInvoiceCarrierSession(payload)
  }
  return postJson('/api/invoice/disconnect', payload)
}
