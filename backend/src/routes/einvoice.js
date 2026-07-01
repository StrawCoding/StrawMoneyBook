import { timingSafeEqual } from 'node:crypto'
import { methodGuard, normalizePath, parseBody, sendJson } from '../collab/http.js'
import {
  cancelScrapeSession,
  queryInvoicesWithScrapeFlow,
  queryScrapeInvoices,
  startScrapeSession,
  submitScrapeCaptcha,
} from '../einvoice/provider.js'
import { validateQueryInput } from '../einvoice/validation.js'

const EINVOICE_CLIENT_SHARED_KEY = String(process.env.EINVOICE_CLIENT_SHARED_KEY ?? '').trim()

function secureEquals(left, right) {
  const leftBytes = Buffer.from(String(left ?? ''), 'utf8')
  const rightBytes = Buffer.from(String(right ?? ''), 'utf8')
  if (leftBytes.length !== rightBytes.length) return false
  return timingSafeEqual(leftBytes, rightBytes)
}

function isClientAuthorized(req) {
  if (!EINVOICE_CLIENT_SHARED_KEY) return false
  const provided = String(
    req.headers?.['x-straw-client-key']
      ?? req.headers?.['X-Straw-Client-Key']
      ?? '',
  ).trim()
  return secureEquals(provided, EINVOICE_CLIENT_SHARED_KEY)
}

function isConfigured() {
  return Boolean(EINVOICE_CLIENT_SHARED_KEY)
}

function mapProviderError(error, res) {
  const code = String(error?.code ?? 'einvoice_query_failed')
  const message = String(error?.message ?? '發票查詢失敗')

  if (code === 'einvoice_captcha_required') {
    sendJson(res, 409, {
      error: code,
      message,
      session_id: error.sessionId ?? '',
      captcha_image_base64: error.captchaImageBase64 ?? '',
    })
    return
  }

  if (code === 'einvoice_captcha_invalid') {
    sendJson(res, 400, { error: code, message })
    return
  }

  if (code === 'einvoice_auth_failed') {
    sendJson(res, 401, { error: code, message })
    return
  }

  if (code === 'einvoice_session_expired') {
    sendJson(res, 410, { error: code, message })
    return
  }

  if (code === 'einvoice_portal_changed') {
    sendJson(res, 502, { error: code, message })
    return
  }

  if (code === 'einvoice_result_too_large') {
    sendJson(res, 413, {
      error: code,
      message,
      totalPages: error.totalPages,
      maxPages: error.maxPages,
    })
    return
  }

  if (code === 'einvoice_cloudflare_timeout') {
    sendJson(res, 504, { error: code, message })
    return
  }

  if (code === 'einvoice_scrape_timeout' || error?.name === 'AbortError') {
    sendJson(res, 504, {
      error: 'einvoice_scrape_timeout',
      message: message || '電子發票查詢逾時，請稍後再試',
    })
    return
  }

  sendJson(res, 500, { error: code, message })
}

async function handleScrapeStart(body) {
  return startScrapeSession({
    session_id: body.session_id,
    cardNo: String(body.cardNo ?? '').trim(),
    cardEncrypt: String(body.cardEncrypt ?? ''),
    refresh_captcha: Boolean(body.refresh_captcha),
    force_captcha: body.force_captcha,
  })
}

async function handleScrapeCaptcha(body) {
  return submitScrapeCaptcha({
    session_id: body.session_id,
    captcha_code: body.captcha_code,
  })
}

async function handleScrapeQuery(body) {
  const cardNo = String(body.cardNo ?? '').trim()
  const cardEncrypt = String(body.cardEncrypt ?? '').trim()
  const startDate = String(body.startDate ?? '').trim()
  const endDate = String(body.endDate ?? '').trim()

  const validationError = validateQueryInput({ cardNo, cardEncrypt, startDate, endDate })
  if (validationError) return { error: validationError }

  const result = await queryScrapeInvoices({
    session_id: body.session_id,
    cardNo,
    cardEncrypt,
    startDate,
    endDate,
    captcha_code: body.captcha_code,
  })
  return { invoices: result.invoices }
}

async function handleScrapeCancel(body) {
  return cancelScrapeSession({ session_id: body.session_id })
}

async function handleQueryInvoicesAlias(body) {
  const cardNo = String(body.cardNo ?? '').trim()
  const cardEncrypt = String(body.cardEncrypt ?? '').trim()
  const startDate = String(body.startDate ?? '').trim()
  const endDate = String(body.endDate ?? '').trim()

  const validationError = validateQueryInput({ cardNo, cardEncrypt, startDate, endDate })
  if (validationError) return { error: validationError }

  const invoices = await queryInvoicesWithScrapeFlow({
    cardNo,
    cardEncrypt,
    startDate,
    endDate,
    force_captcha: false,
  })
  return { invoices }
}

export default async function einvoiceHandler(req, res) {
  if (methodGuard(req, res, ['POST'])) return

  const pathname = normalizePath(req, '/api/einvoice')
  const supportedPaths = new Set([
    '/query-invoices',
    '/scrape/start',
    '/scrape/captcha',
    '/scrape/query',
    '/scrape/cancel',
  ])

  if (!supportedPaths.has(pathname)) {
    sendJson(res, 404, { error: 'not_found', message: 'route not found' })
    return
  }

  if (!isConfigured()) {
    sendJson(res, 503, {
      error: 'einvoice_not_configured',
      message: '電子發票爬蟲尚未設定（缺少 EINVOICE_CLIENT_SHARED_KEY）',
    })
    return
  }

  if (!isClientAuthorized(req)) {
    sendJson(res, 401, { error: 'unauthorized_client', message: 'missing or invalid x-straw-client-key' })
    return
  }

  try {
    const body = parseBody(req)
    let result

    switch (pathname) {
      case '/scrape/start':
        result = await handleScrapeStart(body)
        sendJson(res, 200, result)
        return
      case '/scrape/captcha':
        result = await handleScrapeCaptcha(body)
        sendJson(res, 200, result)
        return
      case '/scrape/query':
        result = await handleScrapeQuery(body)
        if (result?.error) {
          sendJson(res, 400, result.error)
          return
        }
        sendJson(res, 200, { invoices: result.invoices })
        return
      case '/scrape/cancel':
        result = await handleScrapeCancel(body)
        sendJson(res, 200, result)
        return
      case '/query-invoices':
      default: {
        result = await handleQueryInvoicesAlias(body)
        if (result?.error) {
          sendJson(res, 400, result.error)
          return
        }
        sendJson(res, 200, { invoices: result.invoices })
      }
    }
  } catch (error) {
    mapProviderError(error, res)
  }
}
