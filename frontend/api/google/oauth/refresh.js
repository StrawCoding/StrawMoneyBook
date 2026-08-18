import { timingSafeEqual } from 'node:crypto'

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_TOKEN_REQUEST_TIMEOUT_MS = 15 * 1000
const GOOGLE_OAUTH_CLIENT_SHARED_KEY = String(process.env.GOOGLE_OAUTH_CLIENT_SHARED_KEY ?? '').trim()
const ERROR_NUMBER = {
  METHOD_NOT_ALLOWED: 'GOOGLE_REFRESH_001',
  UNAUTHORIZED_CLIENT: 'GOOGLE_REFRESH_002',
  MISSING_REFRESH_TOKEN: 'GOOGLE_REFRESH_003',
  MISSING_GOOGLE_OAUTH_ENV: 'GOOGLE_REFRESH_004',
  TOKEN_REFRESH_FAILED: 'GOOGLE_REFRESH_005',
  MISSING_ACCESS_TOKEN: 'GOOGLE_REFRESH_006',
  REFRESH_REQUEST_FAILED: 'GOOGLE_REFRESH_007',
}

function isProductionRuntime() {
  const vercelEnv = String(process.env.VERCEL_ENV ?? '').trim().toLowerCase()
  if (vercelEnv) return vercelEnv === 'production'
  return String(process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production'
}

// Allowlist mirrors backend/src/collab/http.js PROD_ALLOWED_ORIGINS.
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
  const allowed = isProductionRuntime() ? PROD_ALLOWED_ORIGINS : DEV_ALLOWED_ORIGINS
  if (allowed.has(requestOrigin)) return requestOrigin
  try {
    const parsed = new URL(requestOrigin)
    if (parsed.protocol === 'https:'
      && (parsed.hostname === 'strawmb.com' || parsed.hostname.endsWith('.strawmb.com'))) {
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
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Straw-Client-Key')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
}

function sendJson(res, statusCode, payload) {
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
  if (isProductionRuntime()) return true
  return Boolean(GOOGLE_OAUTH_CLIENT_SHARED_KEY)
}

function secureEquals(left, right) {
  const leftBytes = Buffer.from(String(left ?? ''), 'utf8')
  const rightBytes = Buffer.from(String(right ?? ''), 'utf8')
  if (leftBytes.length !== rightBytes.length) return false
  return timingSafeEqual(leftBytes, rightBytes)
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

// See backend/src/routes/google-oauth.js for the same heuristic. A common operator
// mistake is to paste the OAuth client_id into GOOGLE_OAUTH_CLIENT_SECRET, which
// makes Google reject every refresh with "invalid_client / client secret is invalid"
// and surfaces as the confusing GOOGLE_REFRESH_005. Treating such a value as
// missing produces an actionable MISSING_GOOGLE_OAUTH_ENV instead.
function isClientIdShapedSecret(value) {
  return /\.apps\.googleusercontent\.com$/i.test(String(value ?? '').trim())
}

function getGoogleOAuthEnv() {
  // GOOGLE_OAUTH_CLIENT_ID falls back to GOOGLE_AUTH_WEB_CLIENT_ID so api.strawmb.com
  // can reuse the already configured OAuth web client for refresh-token exchange.
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim() ||
    String(process.env.GOOGLE_AUTH_WEB_CLIENT_ID ?? '').trim()
  const rawClientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '').trim()
  const clientSecretLooksLikeClientId = isClientIdShapedSecret(rawClientSecret)
  return {
    clientId,
    clientSecret: clientSecretLooksLikeClientId ? '' : rawClientSecret,
    clientSecretLooksLikeClientId,
  }
}

function describeMissingOAuthVars({ hasClientId, hasClientSecret, clientSecretLooksLikeClientId }) {
  const missing = []
  if (!hasClientId) missing.push('GOOGLE_AUTH_WEB_CLIENT_ID (or GOOGLE_OAUTH_CLIENT_ID)')
  if (!hasClientSecret) {
    missing.push(
      clientSecretLooksLikeClientId
        ? "GOOGLE_OAUTH_CLIENT_SECRET (current value looks like a Google OAuth client_id ending with '.apps.googleusercontent.com'; paste the OAuth web-client SECRET from Google Cloud Console > APIs & Services > Credentials, which normally starts with 'GOCSPX-')"
        : 'GOOGLE_OAUTH_CLIENT_SECRET',
    )
  }
  return missing
}

export default async function handler(req, res) {
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
  if (shouldEnforceClientAuth()) {
    if (!GOOGLE_OAUTH_CLIENT_SHARED_KEY) {
      sendError(
        res,
        500,
        'missing_google_oauth_client_shared_key',
        'GOOGLE_OAUTH_CLIENT_SHARED_KEY is not configured',
        ERROR_NUMBER.MISSING_GOOGLE_OAUTH_ENV,
      )
      return
    }
    if (!isClientAuthorized(req)) {
      sendError(
        res,
        401,
        'unauthorized_client',
        'missing or invalid x-straw-client-key',
        ERROR_NUMBER.UNAUTHORIZED_CLIENT,
      )
      return
    }
  }

  const body = parseBody(req)
  const refreshToken = String(body.refreshToken ?? body.refresh_token ?? '').trim()
  if (!refreshToken) {
    sendError(res, 400, 'missing_refresh_token', 'refreshToken is required', ERROR_NUMBER.MISSING_REFRESH_TOKEN)
    return
  }
  const { clientId, clientSecret, clientSecretLooksLikeClientId } = getGoogleOAuthEnv()
  if (!clientId || !clientSecret) {
    const missing = describeMissingOAuthVars({
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      clientSecretLooksLikeClientId,
    }).join(' and ')
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
  params.set('client_id', clientId)
  params.set('client_secret', clientSecret)
  params.set('grant_type', 'refresh_token')
  params.set('refresh_token', refreshToken)

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
        'google_token_refresh_failed',
        String(json.error_description ?? json.error ?? rawText ?? 'Google token refresh failed'),
        ERROR_NUMBER.TOKEN_REFRESH_FAILED,
      )
      return
    }

    const accessToken = String(json.access_token ?? '').trim()
    if (!accessToken) {
      sendError(res, 502, 'missing_access_token', 'Google did not return access_token', ERROR_NUMBER.MISSING_ACCESS_TOKEN)
      return
    }

    sendJson(res, 200, {
      accessToken,
      refreshToken: String(json.refresh_token ?? refreshToken).trim(),
      expiresIn: Number(json.expires_in ?? 0) || 0,
      tokenType: String(json.token_type ?? '').trim(),
      scope: String(json.scope ?? '').trim(),
      idToken: String(json.id_token ?? '').trim(),
    })
  } catch (error) {
    sendError(
      res,
      500,
      'google_refresh_request_failed',
      String(error?.message ?? error ?? 'Unknown error'),
      ERROR_NUMBER.REFRESH_REQUEST_FAILED,
    )
  }
}
