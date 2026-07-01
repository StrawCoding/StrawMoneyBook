import { Capacitor } from '@capacitor/core'
import { translateMessage } from '@/ui/services/i18n.service.js'
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

function isFetchNetworkError(err) {
  if (!(err instanceof TypeError)) return false
  const message = String(err?.message ?? '')
  return message === 'Failed to fetch'
    || /NetworkError|Load failed|network error/i.test(message)
}

function mapFetchNetworkError(err) {
  if (!isFetchNetworkError(err)) return err
  return createEInvoiceError(
    translateMessage('einvoice.error.network_failed', {}, '無法連線電子發票服務，請檢查網路後再試'),
    'einvoice_network_failed',
  )
}

async function postEInvoiceApi(path, body, { signal } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (EINVOICE_CLIENT_SHARED_KEY) {
    headers['X-Straw-Client-Key'] = EINVOICE_CLIENT_SHARED_KEY
  }

  let response
  try {
    response = await fetch(buildApiUrl(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(body ?? {}),
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
    if (err?.name === 'AbortError') {
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
