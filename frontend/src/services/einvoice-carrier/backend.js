import { Capacitor } from '@capacitor/core'
import { translateMessage } from '../../ui/services/i18n.service.js'

const IMPORT_META_ENV = import.meta.env ?? {}
const DEFAULT_EINVOICE_API_BASE = String(IMPORT_META_ENV.VITE_EINVOICE_API_BASE_URL ?? '').trim()
const EINVOICE_CLIENT_SHARED_KEY = String(IMPORT_META_ENV.VITE_EINVOICE_CLIENT_SHARED_KEY ?? '').trim()
const PROD_DEFAULT_EINVOICE_API_BASE = 'https://www.strawmb.com'
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

function isGenericNetworkFailure(message) {
  return /^(?:failed to fetch|fetch failed|load failed|network request failed)$/i.test(normalizeText(message))
}

function buildApiUrl(path) {
  const normalizedPath = normalizeText(path)
  if (!normalizedPath.startsWith('/')) {
    throw new Error(`invalid einvoice api path: ${normalizedPath}`)
  }
  const apiBase = getEinvoiceApiBase()
  if (!apiBase) return normalizedPath
  return `${apiBase.replace(/\/$/, '')}${normalizedPath}`
}

export function resolveEinvoiceApiBaseForRuntime(options = {}) {
  const explicitBase = normalizeText(options.explicitBase ?? DEFAULT_EINVOICE_API_BASE)
  const platform = normalizeText(options.platform ?? Capacitor.getPlatform()).toLowerCase() || 'web'

  if (explicitBase) return explicitBase
  if (platform !== 'web') return PROD_DEFAULT_EINVOICE_API_BASE
  return ''
}

export function shouldRequireExplicitEinvoiceApiBaseForRuntime(options = {}) {
  const platform = normalizeText(options.platform ?? Capacitor.getPlatform()).toLowerCase() || 'web'
  if (platform === 'web') return false
  return !resolveEinvoiceApiBaseForRuntime(options)
}

function getEinvoiceApiBase() {
  return resolveEinvoiceApiBaseForRuntime()
}

function shouldRequireExplicitApiBase() {
  return shouldRequireExplicitEinvoiceApiBaseForRuntime()
}

function createMissingEinvoiceApiError() {
  const message = Capacitor.getPlatform() === 'web'
    ? t('einvoice_carrier.error.api_unavailable_web', '發票載具同步 API 未設定，請部署 /api/einvoice 或設定 VITE_EINVOICE_API_BASE_URL')
    : t('einvoice_carrier.error.api_unavailable_native', '手機 App 需設定發票載具同步 API URL，請先部署 /api/einvoice，並將完整網址填入 VITE_EINVOICE_API_BASE_URL')
  const error = new Error(message)
  error.code = 'einvoice_api_unavailable'
  return error
}

function createEinvoiceNetworkError(requestUrl, cause) {
  const causeMessage = normalizeText(cause?.message ?? cause)
  const reasonSuffix = causeMessage && !isGenericNetworkFailure(causeMessage)
    ? `（${causeMessage}）`
    : ''
  const error = new Error(`發票載具同步 API 連線失敗，請確認網路或 API 位址：${requestUrl}${reasonSuffix}`)
  error.code = 'einvoice_network_error'
  error.cause = cause
  return error
}

async function postJson(path, payload) {
  if (shouldRequireExplicitApiBase()) {
    throw createMissingEinvoiceApiError()
  }

  const headers = {
    'Content-Type': 'application/json',
  }
  if (EINVOICE_CLIENT_SHARED_KEY) {
    headers['X-Straw-Client-Key'] = EINVOICE_CLIENT_SHARED_KEY
  }

  const requestUrl = buildApiUrl(path)
  let response
  try {
    response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload ?? {}),
    })
  } catch (error) {
    throw createEinvoiceNetworkError(requestUrl, error)
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
    if (response.status === 404 && !DEFAULT_EINVOICE_API_BASE && path.startsWith('/api/einvoice/')) {
      throw createMissingEinvoiceApiError()
    }
    const error = new Error(normalizeText(data?.message || data?.error || text) || `HTTP ${response.status}`)
    error.code = normalizeText(data?.error) || `HTTP_${response.status}`
    throw error
  }

  if (!data || typeof data !== 'object') {
    const error = new Error('發票載具同步回應格式錯誤')
    error.code = 'einvoice_response_invalid'
    throw error
  }
  return data
}

export function isEinvoiceCarrierFeatureEnabled() {
  return listEinvoiceCarrierProviders().length > 0 && isEinvoiceCarrierApiConfigured()
}

export function isEinvoiceCarrierApiConfigured() {
  return !shouldRequireExplicitApiBase()
}

export function getEinvoiceCarrierApiUnavailableMessage() {
  return createMissingEinvoiceApiError().message
}

export function listEinvoiceCarrierProviders() {
  return PROVIDERS_FALLBACK.slice()
}

export async function createEinvoiceLinkSession(payload = {}) {
  return postJson('/api/einvoice/link_session', payload)
}

export async function exchangeEinvoiceAuth(payload = {}) {
  return postJson('/api/einvoice/exchange', payload)
}

export async function syncEinvoiceInvoices(payload = {}) {
  return postJson('/api/einvoice/sync', payload)
}

export async function disconnectEinvoiceAuth(payload = {}) {
  return postJson('/api/einvoice/disconnect', payload)
}
