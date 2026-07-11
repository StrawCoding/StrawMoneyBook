import { timingSafeEqual } from 'node:crypto'
import { requireAuthenticatedUser } from '../collab/auth-session.js'
import { buildPublicUserProfile } from '../collab/auth-store.js'
import { getCurrentSessionFamilyId } from './auth/shared.js'
import { getClientIp, methodGuard, normalizePath, parseBody, sendJson } from '../collab/http.js'
import { getMembershipGrantSummary } from '../collab/store.js'
import {
  cancelScrapeSession,
  queryInvoicesWithScrapeFlow,
  queryScrapeInvoices,
  startScrapeSession,
  submitScrapeCaptcha,
} from '../einvoice/provider.js'
import { subscribeSessionReleased } from '../einvoice/session-store.js'
import { validateQueryInput } from '../einvoice/validation.js'

const EINVOICE_CLIENT_SHARED_KEY = String(process.env.EINVOICE_CLIENT_SHARED_KEY ?? '').trim()
const EINVOICE_USER_RATE_LIMIT_WINDOW_MS = Math.max(1000, Number(process.env.EINVOICE_USER_RATE_LIMIT_WINDOW_MS ?? 10 * 60_000) || 0)
const EINVOICE_USER_RATE_LIMIT_MAX_REQUESTS = Math.max(1, Number(process.env.EINVOICE_USER_RATE_LIMIT_MAX_REQUESTS ?? 8) || 0)
const EINVOICE_SESSION_RATE_LIMIT_WINDOW_MS = Math.max(1000, Number(process.env.EINVOICE_SESSION_RATE_LIMIT_WINDOW_MS ?? 10 * 60_000) || 0)
const EINVOICE_SESSION_RATE_LIMIT_MAX_REQUESTS = Math.max(1, Number(process.env.EINVOICE_SESSION_RATE_LIMIT_MAX_REQUESTS ?? 6) || 0)
const EINVOICE_CONCURRENT_SESSIONS_PER_USER = Math.max(1, Number(process.env.EINVOICE_CONCURRENT_SESSIONS_PER_USER ?? 1) || 0)

const routeRateLimitBuckets = new Map()
const activeSessionOwners = new Map()
const activeSessionsByUser = new Map()

subscribeSessionReleased((record) => {
  unregisterActiveScrapeSession(record?.sessionId)
})

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

function consumeRouteRateLimit(key, maxRequests, windowMs) {
  const safeKey = String(key ?? '').trim()
  if (!safeKey) return null
  const nowMs = Date.now()
  const bucket = routeRateLimitBuckets.get(safeKey)
  if (!bucket || bucket.resetAt <= nowMs) {
    routeRateLimitBuckets.set(safeKey, {
      count: 1,
      resetAt: nowMs + windowMs,
    })
    return null
  }
  if (bucket.count >= maxRequests) {
    return {
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000)),
    }
  }
  bucket.count += 1
  return null
}

function sendRateLimited(res, retryAfterSeconds) {
  res.setHeader('Retry-After', String(retryAfterSeconds))
  sendJson(res, 429, {
    error: 'einvoice_rate_limited',
    message: '電子發票同步請求過於頻繁，請稍後再試',
    retry_after_seconds: retryAfterSeconds,
  })
}

function unregisterActiveScrapeSession(sessionId) {
  const id = String(sessionId ?? '').trim()
  if (!id) return
  const userId = activeSessionOwners.get(id)
  activeSessionOwners.delete(id)
  if (!userId) return
  const sessions = activeSessionsByUser.get(userId)
  if (!sessions) return
  sessions.delete(id)
  if (!sessions.size) activeSessionsByUser.delete(userId)
}

function registerActiveScrapeSession(sessionId, userId) {
  const id = String(sessionId ?? '').trim()
  const ownerId = String(userId ?? '').trim()
  if (!id || !ownerId) return
  activeSessionOwners.set(id, ownerId)
  const sessions = activeSessionsByUser.get(ownerId) ?? new Set()
  sessions.add(id)
  activeSessionsByUser.set(ownerId, sessions)
}

function hasConcurrentScrapeCapacity(userId) {
  const sessions = activeSessionsByUser.get(String(userId ?? '').trim())
  return !sessions || sessions.size < EINVOICE_CONCURRENT_SESSIONS_PER_USER
}

async function requireEInvoiceAccess(req, res, pathname) {
  if (!isClientAuthorized(req)) {
    sendJson(res, 401, { error: 'unauthorized_client', message: 'missing or invalid x-straw-client-key' })
    return null
  }

  const user = await requireAuthenticatedUser(req, res, sendJson)
  if (!user) return null

  const membership = getMembershipGrantSummary(user)
  if (!membership.active) {
    sendJson(res, 403, {
      error: 'membership_required',
      message: '載具同步僅限會員使用',
      user: await buildPublicUserProfile(user),
    })
    return null
  }

  const userLimit = consumeRouteRateLimit(
    `user:${user.id}`,
    EINVOICE_USER_RATE_LIMIT_MAX_REQUESTS,
    EINVOICE_USER_RATE_LIMIT_WINDOW_MS,
  )
  if (userLimit) {
    sendRateLimited(res, userLimit.retryAfterSeconds)
    return null
  }

  const sessionFamilyId = getCurrentSessionFamilyId(req)
  if (sessionFamilyId) {
    const sessionLimit = consumeRouteRateLimit(
      `session:${sessionFamilyId}`,
      EINVOICE_SESSION_RATE_LIMIT_MAX_REQUESTS,
      EINVOICE_SESSION_RATE_LIMIT_WINDOW_MS,
    )
    if (sessionLimit) {
      sendRateLimited(res, sessionLimit.retryAfterSeconds)
      return null
    }
  }

  const clientIp = getClientIp(req)
  const ipLimit = consumeRouteRateLimit(
    `ip-route:${clientIp}`,
    EINVOICE_USER_RATE_LIMIT_MAX_REQUESTS,
    EINVOICE_USER_RATE_LIMIT_WINDOW_MS,
  )
  if (ipLimit) {
    sendRateLimited(res, ipLimit.retryAfterSeconds)
    return null
  }

  if (pathname === '/scrape/start' && !hasConcurrentScrapeCapacity(user.id)) {
    sendJson(res, 429, {
      error: 'einvoice_concurrent_limit',
      message: '已有載具同步工作進行中，請先完成或取消後再試',
    })
    return null
  }

  return user
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

  try {
    const user = await requireEInvoiceAccess(req, res, pathname)
    if (!user) return

    const body = parseBody(req)
    let result

    switch (pathname) {
      case '/scrape/start':
        result = await handleScrapeStart(body)
        registerActiveScrapeSession(result?.session_id, user.id)
        sendJson(res, 200, result)
        return
      case '/scrape/captcha':
        result = await handleScrapeCaptcha(body)
        sendJson(res, 200, result)
        return
      case '/scrape/query':
        result = await handleScrapeQuery(body)
        unregisterActiveScrapeSession(body.session_id)
        if (result?.error) {
          sendJson(res, 400, result.error)
          return
        }
        sendJson(res, 200, { invoices: result.invoices })
        return
      case '/scrape/cancel':
        result = await handleScrapeCancel(body)
        unregisterActiveScrapeSession(body.session_id)
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
