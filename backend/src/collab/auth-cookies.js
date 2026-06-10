import { getRequestOrigin } from './http.js'

export const REFRESH_TOKEN_COOKIE_NAME = 'straw_refresh_token'
export const AUTH_STORAGE_HEADER = 'x-straw-auth-storage'
export const AUTH_STORAGE_COOKIE_MODE = 'cookie'

const REFRESH_COOKIE_PATH = '/api/auth'

function isProduction() {
  return String(process.env.NODE_ENV ?? '').trim() === 'production'
}

function shouldUseCrossSiteCookie(req) {
  const origin = getRequestOrigin(req)
  if (!origin) return true
  try {
    const parsed = new URL(origin)
    const hostname = String(parsed.hostname ?? '').trim().toLowerCase()
    return hostname !== 'api.strawmb.com' && hostname !== 'localhost' && hostname !== '127.0.0.1'
  } catch {
    return true
  }
}

export function parseCookieHeader(req) {
  const raw = String(req?.headers?.cookie ?? req?.headers?.Cookie ?? '').trim()
  if (!raw) return {}

  const cookies = {}
  for (const part of raw.split(';')) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex <= 0) continue
    const key = part.slice(0, separatorIndex).trim()
    const value = part.slice(separatorIndex + 1).trim()
    if (!key) continue
    try {
      cookies[key] = decodeURIComponent(value)
    } catch {
      cookies[key] = value
    }
  }
  return cookies
}

export function usesCookieAuthStorage(req) {
  return String(req?.headers?.[AUTH_STORAGE_HEADER] ?? req?.headers?.[AUTH_STORAGE_HEADER.toUpperCase()] ?? '')
    .trim()
    .toLowerCase() === AUTH_STORAGE_COOKIE_MODE
}

export function extractRefreshTokenFromRequest(req, body = {}) {
  const fromBody = String(body?.refreshToken ?? body?.refresh_token ?? '').trim()
  if (fromBody) return fromBody
  const cookies = parseCookieHeader(req)
  return String(cookies[REFRESH_TOKEN_COOKIE_NAME] ?? '').trim()
}

export function buildRefreshTokenCookie(refreshToken, {
  req,
  maxAgeSec = 0,
} = {}) {
  const normalizedToken = String(refreshToken ?? '').trim()
  if (!normalizedToken) return ''

  const parts = [
    `${REFRESH_TOKEN_COOKIE_NAME}=${encodeURIComponent(normalizedToken)}`,
    'HttpOnly',
    `Path=${REFRESH_COOKIE_PATH}`,
    'Max-Age=' + Math.max(0, Math.floor(Number(maxAgeSec) || 0)),
  ]

  if (isProduction() || shouldUseCrossSiteCookie(req)) {
    parts.push('Secure')
  }

  parts.push(shouldUseCrossSiteCookie(req) ? 'SameSite=None' : 'SameSite=Lax')
  return parts.join('; ')
}

export function buildClearRefreshTokenCookie(req) {
  const parts = [
    `${REFRESH_TOKEN_COOKIE_NAME}=`,
    'HttpOnly',
    `Path=${REFRESH_COOKIE_PATH}`,
    'Max-Age=0',
  ]

  if (isProduction() || shouldUseCrossSiteCookie(req)) {
    parts.push('Secure')
  }

  parts.push(shouldUseCrossSiteCookie(req) ? 'SameSite=None' : 'SameSite=Lax')
  return parts.join('; ')
}

export function appendSetCookieHeader(res, cookieValue) {
  const normalized = String(cookieValue ?? '').trim()
  if (!normalized) return

  const existing = res.getHeader?.('Set-Cookie')
  if (!existing) {
    res.setHeader('Set-Cookie', normalized)
    return
  }

  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, normalized])
    return
  }

  res.setHeader('Set-Cookie', [String(existing), normalized])
}

export function setRefreshTokenCookie(res, refreshToken, {
  req,
  maxAgeSec = 0,
} = {}) {
  appendSetCookieHeader(res, buildRefreshTokenCookie(refreshToken, { req, maxAgeSec }))
}

export function clearRefreshTokenCookie(res, req) {
  appendSetCookieHeader(res, buildClearRefreshTokenCookie(req))
}

export function buildAuthSessionResponse(session, {
  cookieMode = false,
  extra = {},
} = {}) {
  const payload = {
    token: session.accessToken,
    access_token: session.accessToken,
    token_type: 'Bearer',
    expires_in: session.expiresInSec,
    user: session.publicProfile,
    ...extra,
  }

  if (!cookieMode) {
    payload.refresh_token = session.refreshToken
    payload.refresh_token_expires_in = session.refreshExpiresInSec
    payload.refresh_token_expires_at = session.refreshTokenExpiresAt
  }

  return payload
}
