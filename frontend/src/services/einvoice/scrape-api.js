import { Capacitor } from '@capacitor/core'
import { translateMessage } from '@/ui/services/i18n.service.js'
import { refreshSharedLedgerSession, getSharedLedgerSession } from '@/services/shared-ledger/backend.js'
import { getAuthStorageHeaders, shouldSendAuthCredentials } from '@/services/shared-ledger/auth-session-storage.js'
import { createEInvoiceError } from './shared.js'

const PROD_DEFAULT_API_BASE = 'https://api.strawmb.com'
const EXPLICIT_API_BASE = String(import.meta.env.VITE_EINVOICE_API_BASE_URL ?? '').trim()
const EINVOICE_CLIENT_SHARED_KEY = String(import.meta.env.VITE_EINVOICE_CLIENT_SHARED_KEY ?? '').trim()
const EINVOICE_QUERY_TIMEOUT_MS = 35_000

function getEInvoiceApiBase() {
  if (EXPLICIT_API_BASE) return EXPLICIT_API_BASE
  if (Capacitor.getPlatform() !== 'web') return PROD_DEFAULT_API_BASE
  if (import.meta.env.PROD) return PROD_DEFAULT_API_BASE
  return ''
}

function buildApiUrl(path) {
  const base = getEInvoiceApiBase()
  return base ? `${base.replace(/\/$/, '')}${path}` : path
}

function getEInvoiceCredentialsMode() {
  // Cookie-auth clients must send credentials:include AND the auth-storage header
  // so the API reflects Origin + Allow-Credentials. Using include without that
  // header yields ACAO:* under ALLOW_ALL_ORIGINS → browser Failed to fetch →
  // false einvoice_network_failed.
  return shouldSendAuthCredentials() ? 'include' : 'same-origin'
}

async function buildEInvoiceRequestHeaders({ includeJsonContentType = false } = {}) {
  const session = await refreshSharedLedgerSession().catch(() => getSharedLedgerSession())
  const headers = {
    ...(includeJsonContentType ? { 'Content-Type': 'application/json' } : {}),
    // Always attach cookie-auth markers when in cookie mode, including health GET.
    ...(shouldSendAuthCredentials() ? getAuthStorageHeaders() : {}),
  }
  if (EINVOICE_CLIENT_SHARED_KEY) {
    headers['X-Straw-Client-Key'] = EINVOICE_CLIENT_SHARED_KEY
  }
  const token = String(session?.token ?? '').trim()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

function isAbortError(err) {
  return err?.name === 'AbortError'
    || (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError')
}

function isFetchNetworkError(err) {
  if (isAbortError(err)) return false
  if (!(err instanceof TypeError)) return false
  const message = String(err?.message ?? '')
  return message === 'Failed to fetch'
    || /NetworkError|Load failed|network error/i.test(message)
}

function mapFetchNetworkError(err) {
  if (isAbortError(err)) {
    return createEInvoiceError('查詢逾時，請稍後再試', 'einvoice_query_timeout')
  }
  if (!isFetchNetworkError(err)) return err
  return createEInvoiceError(
    translateMessage('einvoice.error.network_failed', {}, '無法連線電子發票服務，請檢查網路後再試'),
    'einvoice_network_failed',
  )
}

async function postEInvoiceApi(path, body, { signal } = {}) {
  const headers = await buildEInvoiceRequestHeaders({ includeJsonContentType: true })

  let response
  try {
    response = await fetch(buildApiUrl(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(body ?? {}),
      credentials: getEInvoiceCredentialsMode(),
      signal,
    })
  } catch (err) {
    throw mapFetchNetworkError(err)
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    const errorCode = String(data?.error ?? 'einvoice_query_failed')
    const errorMessage = String(data?.message ?? '查詢發票失敗，請重試')
    const error = createEInvoiceError(errorMessage, errorCode)
    if (data?.session_id) error.sessionId = data.session_id
    if (data?.captcha_image_base64) error.captchaImageBase64 = data.captcha_image_base64
    throw error
  }

  return data
}

export async function startEInvoiceScrapeSession(payload = {}, options = {}) {
  return postEInvoiceApi('/api/einvoice/scrape/start', payload, options)
}

export async function submitEInvoiceScrapeCaptcha(payload = {}, options = {}) {
  return postEInvoiceApi('/api/einvoice/scrape/captcha', payload, options)
}

export async function queryEInvoiceScrapeInvoices(payload = {}, options = {}) {
  const data = await postEInvoiceApi('/api/einvoice/scrape/query', payload, options)
  return Array.isArray(data?.invoices) ? data.invoices : []
}

export async function cancelEInvoiceScrapeSession(payload = {}, options = {}) {
  return postEInvoiceApi('/api/einvoice/scrape/cancel', payload, options)
}

export async function queryEInvoiceInvoicesAlias(payload = {}, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EINVOICE_QUERY_TIMEOUT_MS)
  const signal = options.signal ?? controller.signal
  try {
    const data = await postEInvoiceApi('/api/einvoice/query-invoices', payload, { signal })
    return Array.isArray(data?.invoices) ? data.invoices : []
  } catch (err) {
    if (isAbortError(err) || err?.code === 'einvoice_query_timeout') {
      throw createEInvoiceError('查詢逾時，請稍後再試', 'einvoice_query_timeout')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

export function isEInvoiceApiConfigured() {
  if (EINVOICE_CLIENT_SHARED_KEY) return true
  if (Capacitor.getPlatform() !== 'web') return true
  if (import.meta.env.PROD) return true
  return Boolean(getEInvoiceApiBase())
}

/**
 * Lightweight health probe. HTTP 200 / configured=true means the API is reachable,
 * NOT that portal login or scrape will succeed.
 */
export async function probeEInvoiceApiHealth({ signal } = {}) {
  const checkedAt = Date.now()
  if (!isEInvoiceApiConfigured()) {
    return {
      ok: false,
      configured: false,
      checkedAt,
      errorCode: 'carrier_sync_api_not_configured',
      note: 'health_ok_does_not_mean_portal_login_ok',
    }
  }

  try {
    const headers = await buildEInvoiceRequestHeaders()
    const response = await fetch(buildApiUrl('/api/einvoice/health'), {
      method: 'GET',
      headers,
      credentials: getEInvoiceCredentialsMode(),
      signal,
    })
    let data = null
    try {
      data = await response.json()
    } catch {
      data = null
    }

    if (!response.ok) {
      return {
        ok: false,
        configured: Boolean(data?.configured),
        checkedAt,
        errorCode: String(data?.error ?? `einvoice_health_http_${response.status}`),
        note: 'health_ok_does_not_mean_portal_login_ok',
      }
    }

    return {
      ok: Boolean(data?.ok !== false),
      configured: data?.configured !== false,
      checkedAt,
      errorCode: null,
      note: String(data?.note ?? 'health_ok_does_not_mean_portal_login_ok'),
    }
  } catch (err) {
    const mapped = mapFetchNetworkError(err)
    return {
      ok: false,
      configured: isEInvoiceApiConfigured(),
      checkedAt,
      errorCode: String(mapped?.code ?? 'einvoice_network_failed'),
      note: 'health_ok_does_not_mean_portal_login_ok',
    }
  }
}
