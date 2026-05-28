import { createServer } from 'node:http'
import { getClientIp, isOriginAllowed, sendJson } from './collab/http.js'
import { resolveRouteHandler } from './routes/route-table.js'

const HOST = String(process.env.HOST ?? '0.0.0.0').trim() || '0.0.0.0'
const PORT = Math.max(1, Number(process.env.PORT ?? 8787) || 8787)
const MAX_BODY_BYTES = Math.max(1024, Number(process.env.MAX_BODY_BYTES ?? 8 * 1024 * 1024) || 0)
const GLOBAL_RATE_LIMIT_WINDOW_MS = Math.max(1000, Number(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS ?? 60_000) || 0)
const GLOBAL_RATE_LIMIT_MAX_REQUESTS = Math.max(20, Number(process.env.GLOBAL_RATE_LIMIT_MAX_REQUESTS ?? 180) || 0)
const AUTH_RATE_LIMIT_WINDOW_MS = Math.max(1000, Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 10 * 60_000) || 0)
const AUTH_RATE_LIMIT_MAX_REQUESTS = Math.max(5, Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS ?? 40) || 0)
const EINVOICE_RATE_LIMIT_WINDOW_MS = Math.max(1000, Number(process.env.EINVOICE_RATE_LIMIT_WINDOW_MS ?? 10 * 60_000) || 0)
const EINVOICE_RATE_LIMIT_MAX_REQUESTS = Math.max(3, Number(process.env.EINVOICE_RATE_LIMIT_MAX_REQUESTS ?? 12) || 0)
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS ?? '').trim()

const rateLimitBuckets = new Map()

function ensureNodeStyleResponse(res) {
  if (typeof res.status !== 'function') {
    res.status = function status(code) {
      res.statusCode = Number(code) || 200
      return res
    }
  }
  if (typeof res.json !== 'function') {
    res.json = function json(payload) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
      }
      res.end(JSON.stringify(payload))
      return res
    }
  }
  return res
}

function getRateLimitPolicy(pathname) {
  if (pathname.startsWith('/api/auth')) {
    return {
      key: 'auth',
      maxRequests: AUTH_RATE_LIMIT_MAX_REQUESTS,
      windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    }
  }

  if (pathname.startsWith('/api/einvoice')) {
    return {
      key: 'einvoice',
      maxRequests: EINVOICE_RATE_LIMIT_MAX_REQUESTS,
      windowMs: EINVOICE_RATE_LIMIT_WINDOW_MS,
    }
  }

  return {
    key: 'global',
    maxRequests: GLOBAL_RATE_LIMIT_MAX_REQUESTS,
    windowMs: GLOBAL_RATE_LIMIT_WINDOW_MS,
  }
}

function consumeRateLimit(req, pathname) {
  if (req.method === 'OPTIONS') {
    return null
  }
  const policy = getRateLimitPolicy(pathname)
  const ip = getClientIp(req)
  const bucketKey = `${policy.key}:${ip}`
  const nowMs = Date.now()
  const bucket = rateLimitBuckets.get(bucketKey)

  if (!bucket || bucket.resetAt <= nowMs) {
    rateLimitBuckets.set(bucketKey, {
      count: 1,
      resetAt: nowMs + policy.windowMs,
    })
    return null
  }

  if (bucket.count >= policy.maxRequests) {
    return {
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000)),
    }
  }

  bucket.count += 1
  return null
}

async function readRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return Buffer.alloc(0)
  const chunks = []
  let totalBytes = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.length
    if (totalBytes > MAX_BODY_BYTES) {
      const error = new Error('request body too large')
      error.code = 'request_entity_too_large'
      error.status = 413
      throw error
    }
    chunks.push(buffer)
  }

  return Buffer.concat(chunks)
}

const server = createServer(async (req, res) => {
  const response = ensureNodeStyleResponse(res)
  response.__request = req

  try {
    const host = String(req.headers?.host ?? `${HOST}:${PORT}`)
    const pathname = new URL(String(req.url ?? '/'), `http://${host}`).pathname

    if (!isOriginAllowed(req)) {
      sendJson(response, 403, {
        error: 'origin_not_allowed',
        message: 'origin not allowed',
      })
      return
    }

    const rateLimitResult = consumeRateLimit(req, pathname)
    if (rateLimitResult) {
      response.setHeader('Retry-After', String(rateLimitResult.retryAfterSeconds))
      sendJson(response, 429, {
        error: 'rate_limited',
        message: 'request rate limited',
        retry_after_seconds: rateLimitResult.retryAfterSeconds,
      })
      return
    }

    req.rawBody = await readRequestBody(req)
    const contentType = String(req.headers?.['content-type'] ?? '').toLowerCase()
    if (!req.rawBody.length) {
      req.body = ''
    } else if (contentType.includes('application/json') || contentType.startsWith('text/')) {
      req.body = req.rawBody.toString('utf8')
    } else {
      req.body = req.rawBody
    }

    const route = resolveRouteHandler(pathname)

    if (route?.type === 'health') {
      sendJson(response, 200, {
        ok: true,
        service: 'strawmoneybook-backend',
      })
      return
    }

    if (route?.handler) {
      await route.handler(req, response)
      return
    }

    sendJson(response, 404, {
      error: 'not_found',
      message: 'route not found',
    })
  } catch (error) {
    if (error?.code === 'request_entity_too_large') {
      sendJson(response, 413, {
        error: 'request_entity_too_large',
        message: 'request body too large',
      })
      return
    }

    sendJson(response, 500, {
      error: 'server_error',
      message: String(error?.message ?? error ?? 'unknown error'),
    })
  }
})

server.listen(PORT, HOST, () => {
  if (ALLOWED_ORIGINS === '*') {
    console.warn('[security] ALLOWED_ORIGINS=* is set; all origins are allowed. Do not use this in production.')
  }
  const hasGoogleClientId = Boolean(
    String(process.env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim() ||
    String(process.env.GOOGLE_AUTH_WEB_CLIENT_ID ?? '').trim(),
  )
  const rawGoogleClientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '').trim()
  const hasGoogleClientSecret = Boolean(rawGoogleClientSecret)
  const clientSecretLooksLikeClientId = /\.apps\.googleusercontent\.com$/i.test(rawGoogleClientSecret)
  if (clientSecretLooksLikeClientId) {
    console.error(
      "[google-oauth] GOOGLE_OAUTH_CLIENT_SECRET appears to be a Google OAuth client_id "
        + "(ends with '.apps.googleusercontent.com'). A real OAuth web-client secret starts with "
        + "'GOCSPX-'. Until this is corrected, Google Drive backup will fail with "
        + 'GOOGLE_EXCHANGE_004 / GOOGLE_REFRESH_004 (the route now treats a client_id-shaped '
        + 'secret as missing so callers receive an actionable error). Update '
        + 'GOOGLE_OAUTH_CLIENT_SECRET in the env file with the OAuth web-client secret from '
        + 'Google Cloud Console > APIs & Services > Credentials > (your web client) > Client secret.',
    )
  } else if (!hasGoogleClientId || !hasGoogleClientSecret) {
    const missing = [
      !hasGoogleClientId && 'GOOGLE_AUTH_WEB_CLIENT_ID (or GOOGLE_OAUTH_CLIENT_ID)',
      !hasGoogleClientSecret && 'GOOGLE_OAUTH_CLIENT_SECRET',
    ].filter(Boolean)
    console.warn(`[google-oauth] Missing env vars: ${missing.join(', ')}. Google Drive backup token exchange will fail with GOOGLE_EXCHANGE_004 / GOOGLE_REFRESH_004 until these are configured.`)
  }
  console.log(`[backend] listening on http://${HOST}:${PORT}`)
})
