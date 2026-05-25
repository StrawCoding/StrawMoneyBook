import { timingSafeEqual } from 'node:crypto'

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_TOKEN_REQUEST_TIMEOUT_MS = 15 * 1000
const GOOGLE_OAUTH_CLIENT_SHARED_KEY = String(process.env.GOOGLE_OAUTH_CLIENT_SHARED_KEY ?? '').trim()
const ERROR_NUMBER = {
  METHOD_NOT_ALLOWED: 'GOOGLE_EXCHANGE_001',
  UNAUTHORIZED_CLIENT: 'GOOGLE_EXCHANGE_002',
  MISSING_SERVER_AUTH_CODE: 'GOOGLE_EXCHANGE_003',
  MISSING_GOOGLE_OAUTH_ENV: 'GOOGLE_EXCHANGE_004',
  TOKEN_EXCHANGE_FAILED: 'GOOGLE_EXCHANGE_005',
  MISSING_ACCESS_TOKEN: 'GOOGLE_EXCHANGE_006',
  EXCHANGE_REQUEST_FAILED: 'GOOGLE_EXCHANGE_007',
}

// Allowlist mirrors backend/src/collab/http.js PROD_ALLOWED_ORIGINS.
// Capacitor apps use 'capacitor://localhost'; web apps use the HTTPS domain.
const PROD_ALLOWED_ORIGINS = new Set([
  'https://strawmb.com',
  'https://www.strawmb.com',
  'capacitor://localhost',
  'ionic://localhost',
])
const DEV_ALLOWED_ORIGINS = new Set([
  ...PROD_ALLOWED_ORIGINS,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
])

function resolveAllowedOrigin(requestOrigin) {
  if (!requestOrigin) return null
  const allowed = process.env.NODE_ENV === 'production' ? PROD_ALLOWED_ORIGINS : DEV_ALLOWED_ORIGINS
  if (allowed.has(requestOrigin)) return requestOrigin
  // Also allow any *.strawmb.com subdomain over HTTPS
  try {
    const parsed = new URL(requestOrigin)
    if (parsed.protocol === 'https:' &&
        (parsed.hostname === 'strawmb.com' || parsed.hostname.endsWith('.strawmb.com'))) {
      return requestOrigin
    }
  } catch {
    // malformed origin — deny
  }
  return null
}

function setCorsHeaders(req, res) {
  const requestOrigin = String(req?.headers?.origin ?? '').trim()
  const allowedOrigin = resolveAllowedOrigin(requestOrigin)
  // Only set Allow-Origin when origin is explicitly recognised; native apps (no Origin header)
  // rely on the absence of the header — which is correct behaviour for same-origin requests.
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Straw-Client-Key')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
}

function sendJson(res, statusCode, payload) {
  // res.__request is attached at the top of handler() so setCorsHeaders can read the Origin.
  setCorsHeaders(res.__request ?? {}, res)
  res.status(statusCode).json(payload)
}

function sendError(res, statusCode, error, message, errorNumber) {
  sendJson(res, statusCode, {
    error,
    message,
    errorNumber,
  })
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return {}
}

function isClientAuthorized(req) {
  if (!GOOGLE_OAUTH_CLIENT_SHARED_KEY) return false
  const provided = String(
    req.headers?.['x-straw-client-key']
      ?? req.headers?.['X-Straw-Client-Key']
      ?? '',
  ).trim()
  return secureEquals(provided, GOOGLE_OAUTH_CLIENT_SHARED_KEY)
}

function shouldEnforceClientAuth() {
  return Boolean(GOOGLE_OAUTH_CLIENT_SHARED_KEY)
}

function secureEquals(left, right) {
  const leftBytes = Buffer.from(String(left ?? ''), 'utf8')
  const rightBytes = Buffer.from(String(right ?? ''), 'utf8')
  if (leftBytes.length !== rightBytes.length) return false
  return timingSafeEqual(leftBytes, rightBytes)
}

function decodeJwtPayload(token) {
  const raw = String(token ?? '').trim()
  if (!raw) return {}
  const parts = raw.split('.')
  if (parts.length < 2) return {}
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  try {
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return {}
  }
}

function normalizeTokenPayload(data = {}) {
  const idToken = String(data.id_token ?? '').trim()
  const claims = decodeJwtPayload(idToken)
  return {
    accessToken: String(data.access_token ?? '').trim(),
    refreshToken: String(data.refresh_token ?? '').trim(),
    expiresIn: Number(data.expires_in ?? 0) || 0,
    tokenType: String(data.token_type ?? '').trim(),
    scope: String(data.scope ?? '').trim(),
    idToken,
    profile: {
      email: String(claims.email ?? '').trim(),
      name: String(claims.name ?? '').trim(),
      imageUrl: String(claims.picture ?? '').trim(),
    },
  }
}

async function requestGoogleToken(params) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let timeoutId = 0
  if (controller) {
    timeoutId = setTimeout(() => {
      controller.abort()
    }, GOOGLE_TOKEN_REQUEST_TIMEOUT_MS)
  }

  try {
    return await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
      ...(controller ? { signal: controller.signal } : {}),
    })
  } catch (error) {
    if (controller?.signal?.aborted) {
      throw new Error('Google token endpoint timeout')
    }
    throw error
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function getGoogleOAuthEnv() {
  // GOOGLE_OAUTH_CLIENT_ID falls back to GOOGLE_AUTH_WEB_CLIENT_ID so api.strawmb.com
  // can reuse the already configured OAuth web client for server-auth-code exchange.
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim() ||
    String(process.env.GOOGLE_AUTH_WEB_CLIENT_ID ?? '').trim()
  return {
    clientId,
    clientSecret: String(process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '').trim(),
    redirectUri: String(process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '').trim(),
  }
}

export default async function handler(req, res) {
  // Attach req so that sendJson → setCorsHeaders can read the Origin header
  // without threading req through every helper function.
  res.__request = req

  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res)
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    sendError(res, 405, 'method_not_allowed', 'Method not allowed', ERROR_NUMBER.METHOD_NOT_ALLOWED)
    return
  }
  if (shouldEnforceClientAuth() && !isClientAuthorized(req)) {
    sendError(
      res,
      401,
      'unauthorized_client',
      'missing or invalid x-straw-client-key',
      ERROR_NUMBER.UNAUTHORIZED_CLIENT,
    )
    return
  }

  const body = parseBody(req)
  const serverAuthCode = String(body.serverAuthCode ?? body.code ?? '').trim()
  if (!serverAuthCode) {
    sendError(res, 400, 'missing_server_auth_code', 'serverAuthCode is required', ERROR_NUMBER.MISSING_SERVER_AUTH_CODE)
    return
  }

  const { clientId, clientSecret, redirectUri } = getGoogleOAuthEnv()
  if (!clientId || !clientSecret) {
    const missing = [
      !clientId && 'GOOGLE_AUTH_WEB_CLIENT_ID (or GOOGLE_OAUTH_CLIENT_ID)',
      !clientSecret && 'GOOGLE_OAUTH_CLIENT_SECRET',
    ].filter(Boolean).join(' and ')
    sendError(
      res,
      500,
      'missing_google_oauth_env',
      `${missing} are required`,
      ERROR_NUMBER.MISSING_GOOGLE_OAUTH_ENV,
    )
    return
  }

  const params = new URLSearchParams()
  params.set('code', serverAuthCode)
  params.set('client_id', clientId)
  params.set('client_secret', clientSecret)
  params.set('grant_type', 'authorization_code')
  if (redirectUri) {
    params.set('redirect_uri', redirectUri)
  }

  try {
    const response = await requestGoogleToken(params)

    const rawText = await response.text()
    let json = {}
    if (rawText) {
      try {
        json = JSON.parse(rawText)
      } catch {
        json = { raw: rawText }
      }
    }

    if (!response.ok) {
      sendError(
        res,
        response.status,
        'google_token_exchange_failed',
        String(json.error_description ?? json.error ?? rawText ?? 'Google token exchange failed'),
        ERROR_NUMBER.TOKEN_EXCHANGE_FAILED,
      )
      return
    }

    const payload = normalizeTokenPayload(json)
    if (!payload.accessToken) {
      sendError(res, 502, 'missing_access_token', 'Google did not return access_token', ERROR_NUMBER.MISSING_ACCESS_TOKEN)
      return
    }

    sendJson(res, 200, payload)
  } catch (error) {
    sendError(
      res,
      500,
      'google_exchange_request_failed',
      String(error?.message ?? error ?? 'Unknown error'),
      ERROR_NUMBER.EXCHANGE_REQUEST_FAILED,
    )
  }
}
