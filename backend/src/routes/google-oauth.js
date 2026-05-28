import { timingSafeEqual } from 'node:crypto'
import { methodGuard, sendJson } from '../collab/http.js'

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_TOKEN_REQUEST_TIMEOUT_MS = 15 * 1000
const GOOGLE_OAUTH_CLIENT_SHARED_KEY = String(process.env.GOOGLE_OAUTH_CLIENT_SHARED_KEY ?? '').trim()

const EXCHANGE_ERROR_NUMBER = Object.freeze({
  METHOD_NOT_ALLOWED: 'GOOGLE_EXCHANGE_001',
  UNAUTHORIZED_CLIENT: 'GOOGLE_EXCHANGE_002',
  MISSING_SERVER_AUTH_CODE: 'GOOGLE_EXCHANGE_003',
  MISSING_GOOGLE_OAUTH_ENV: 'GOOGLE_EXCHANGE_004',
  TOKEN_EXCHANGE_FAILED: 'GOOGLE_EXCHANGE_005',
  MISSING_ACCESS_TOKEN: 'GOOGLE_EXCHANGE_006',
  EXCHANGE_REQUEST_FAILED: 'GOOGLE_EXCHANGE_007',
})

const REFRESH_ERROR_NUMBER = Object.freeze({
  METHOD_NOT_ALLOWED: 'GOOGLE_REFRESH_001',
  UNAUTHORIZED_CLIENT: 'GOOGLE_REFRESH_002',
  MISSING_REFRESH_TOKEN: 'GOOGLE_REFRESH_003',
  MISSING_GOOGLE_OAUTH_ENV: 'GOOGLE_REFRESH_004',
  TOKEN_REFRESH_FAILED: 'GOOGLE_REFRESH_005',
  MISSING_ACCESS_TOKEN: 'GOOGLE_REFRESH_006',
  REFRESH_REQUEST_FAILED: 'GOOGLE_REFRESH_007',
})

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

function secureEquals(left, right) {
  const leftBytes = Buffer.from(String(left ?? ''), 'utf8')
  const rightBytes = Buffer.from(String(right ?? ''), 'utf8')
  if (leftBytes.length !== rightBytes.length) return false
  return timingSafeEqual(leftBytes, rightBytes)
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

function sendError(res, statusCode, error, message, errorNumber) {
  sendJson(res, statusCode, {
    error,
    message,
    errorNumber,
  })
}

function sendMethodNotAllowed(res, errorNumber) {
  sendError(res, 405, 'method_not_allowed', 'Method not allowed', errorNumber)
}

function sendUnauthorizedClient(res, errorNumber) {
  sendError(res, 401, 'unauthorized_client', 'missing or invalid x-straw-client-key', errorNumber)
}

function sendMissingGoogleEnv(res, errorNumber, missingVars = []) {
  const varList = missingVars.length > 0 ? missingVars.join(', ') : 'GOOGLE_OAUTH_CLIENT_SECRET'
  sendError(
    res,
    500,
    'missing_google_oauth_env',
    `${varList} is not configured on the server`,
    errorNumber,
  )
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

// Heuristic used to detect a common operator mistake: pasting the Google OAuth web
// client_id value into GOOGLE_OAUTH_CLIENT_SECRET. Real Google OAuth web-client
// secrets begin with the "GOCSPX-" prefix and never end with
// ".apps.googleusercontent.com". When the configured secret has the shape of a
// client_id, Google's token endpoint responds with "invalid_client / The provided
// client secret is invalid." which on the client side surfaces as the confusing
// GOOGLE_EXCHANGE_005 (TOKEN_EXCHANGE_FAILED). Treating such a value as missing
// instead lets the request fail fast with the actionable
// MISSING_GOOGLE_OAUTH_ENV error so the operator can fix the env.
function isClientIdShapedSecret(value) {
  return /\.apps\.googleusercontent\.com$/i.test(String(value ?? '').trim())
}

function getGoogleOAuthEnv() {
  // GOOGLE_OAUTH_CLIENT_ID falls back to GOOGLE_AUTH_WEB_CLIENT_ID so operators only
  // need to set the separate var when using a different OAuth 2.0 web client for exchange.
  const clientId = (
    String(process.env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim() ||
    String(process.env.GOOGLE_AUTH_WEB_CLIENT_ID ?? '').trim()
  )
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

function resolveExchangeRedirectUri(body = {}) {
  // Android/iOS server auth code exchange must not send redirect_uri unless the client
  // explicitly passes one. GOOGLE_OAUTH_REDIRECT_URI is intentionally ignored because
  // operators often set it for web OAuth callbacks, which breaks mobile offline exchange
  // with GOOGLE_EXCHANGE_005 (invalid_grant / redirect_uri_mismatch).
  return String(body.redirectUri ?? body.redirect_uri ?? '').trim()
}

async function parseGoogleTokenResponse(response) {
  const rawText = await response.text()
  if (!rawText) return { rawText, json: {} }
  try {
    return { rawText, json: JSON.parse(rawText) }
  } catch {
    return { rawText, json: { raw: rawText } }
  }
}

async function exchangeServerAuthCode(req, res) {
  if (req.method === 'OPTIONS') {
    methodGuard(req, res, ['POST'])
    return
  }
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, EXCHANGE_ERROR_NUMBER.METHOD_NOT_ALLOWED)
    return
  }
  if (shouldEnforceClientAuth() && !isClientAuthorized(req)) {
    sendUnauthorizedClient(res, EXCHANGE_ERROR_NUMBER.UNAUTHORIZED_CLIENT)
    return
  }

  const body = parseBody(req)
  const serverAuthCode = String(body.serverAuthCode ?? body.code ?? '').trim()
  if (!serverAuthCode) {
    sendError(
      res,
      400,
      'missing_server_auth_code',
      'serverAuthCode is required',
      EXCHANGE_ERROR_NUMBER.MISSING_SERVER_AUTH_CODE,
    )
    return
  }

  const { clientId, clientSecret, clientSecretLooksLikeClientId } = getGoogleOAuthEnv()
  if (!clientId || !clientSecret) {
    const missing = describeMissingOAuthVars({
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      clientSecretLooksLikeClientId,
    })
    sendMissingGoogleEnv(res, EXCHANGE_ERROR_NUMBER.MISSING_GOOGLE_OAUTH_ENV, missing)
    return
  }

  const params = new URLSearchParams()
  params.set('code', serverAuthCode)
  params.set('client_id', clientId)
  params.set('client_secret', clientSecret)
  params.set('grant_type', 'authorization_code')
  const redirectUri = resolveExchangeRedirectUri(body)
  if (redirectUri) params.set('redirect_uri', redirectUri)

  try {
    const response = await requestGoogleToken(params)
    const { rawText, json } = await parseGoogleTokenResponse(response)
    if (!response.ok) {
      sendError(
        res,
        response.status,
        'google_token_exchange_failed',
        String(json.error_description ?? json.error ?? rawText ?? 'Google token exchange failed'),
        EXCHANGE_ERROR_NUMBER.TOKEN_EXCHANGE_FAILED,
      )
      return
    }

    const payload = normalizeTokenPayload(json)
    if (!payload.accessToken) {
      sendError(res, 502, 'missing_access_token', 'Google did not return access_token', EXCHANGE_ERROR_NUMBER.MISSING_ACCESS_TOKEN)
      return
    }
    sendJson(res, 200, payload)
  } catch (error) {
    sendError(
      res,
      500,
      'google_exchange_request_failed',
      String(error?.message ?? error ?? 'Unknown error'),
      EXCHANGE_ERROR_NUMBER.EXCHANGE_REQUEST_FAILED,
    )
  }
}

async function refreshAccessToken(req, res) {
  if (req.method === 'OPTIONS') {
    methodGuard(req, res, ['POST'])
    return
  }
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, REFRESH_ERROR_NUMBER.METHOD_NOT_ALLOWED)
    return
  }
  if (shouldEnforceClientAuth() && !isClientAuthorized(req)) {
    sendUnauthorizedClient(res, REFRESH_ERROR_NUMBER.UNAUTHORIZED_CLIENT)
    return
  }

  const body = parseBody(req)
  const refreshToken = String(body.refreshToken ?? body.refresh_token ?? '').trim()
  if (!refreshToken) {
    sendError(res, 400, 'missing_refresh_token', 'refreshToken is required', REFRESH_ERROR_NUMBER.MISSING_REFRESH_TOKEN)
    return
  }

  const { clientId, clientSecret, clientSecretLooksLikeClientId } = getGoogleOAuthEnv()
  if (!clientId || !clientSecret) {
    const missing = describeMissingOAuthVars({
      hasClientId: Boolean(clientId),
      hasClientSecret: Boolean(clientSecret),
      clientSecretLooksLikeClientId,
    })
    sendMissingGoogleEnv(res, REFRESH_ERROR_NUMBER.MISSING_GOOGLE_OAUTH_ENV, missing)
    return
  }

  const params = new URLSearchParams()
  params.set('client_id', clientId)
  params.set('client_secret', clientSecret)
  params.set('grant_type', 'refresh_token')
  params.set('refresh_token', refreshToken)

  try {
    const response = await requestGoogleToken(params)
    const { rawText, json } = await parseGoogleTokenResponse(response)
    if (!response.ok) {
      sendError(
        res,
        response.status,
        'google_token_refresh_failed',
        String(json.error_description ?? json.error ?? rawText ?? 'Google token refresh failed'),
        REFRESH_ERROR_NUMBER.TOKEN_REFRESH_FAILED,
      )
      return
    }

    const payload = normalizeTokenPayload(json)
    if (!payload.accessToken) {
      sendError(res, 502, 'missing_access_token', 'Google did not return access_token', REFRESH_ERROR_NUMBER.MISSING_ACCESS_TOKEN)
      return
    }
    sendJson(res, 200, {
      ...payload,
      refreshToken: payload.refreshToken || refreshToken,
    })
  } catch (error) {
    sendError(
      res,
      500,
      'google_refresh_request_failed',
      String(error?.message ?? error ?? 'Unknown error'),
      REFRESH_ERROR_NUMBER.REFRESH_REQUEST_FAILED,
    )
  }
}

export function resolveGoogleOAuthRoute(method, segments = []) {
  const [kind] = segments
  if (kind === 'exchange') return { name: 'google_oauth_exchange', handler: exchangeServerAuthCode }
  if (kind === 'refresh') return { name: 'google_oauth_refresh', handler: refreshAccessToken }
  return null
}

export default async function googleOAuthHandler(req, res) {
  const pathname = new URL(String(req.url ?? '/'), 'http://localhost').pathname
  const segments = pathname.replace(/^\/api\/google\/oauth\/?/, '').split('/').filter(Boolean)
  const route = resolveGoogleOAuthRoute(req.method, segments)
  if (!route) {
    sendJson(res, 404, {
      error: 'not_found',
      message: 'route not found',
    })
    return
  }
  await route.handler(req, res)
}
