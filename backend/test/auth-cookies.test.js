import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AUTH_STORAGE_COOKIE_MODE,
  AUTH_STORAGE_HEADER,
  REFRESH_TOKEN_COOKIE_NAME,
  buildAuthSessionResponse,
  buildClearRefreshTokenCookie,
  buildRefreshTokenCookie,
  extractRefreshTokenFromRequest,
  parseCookieHeader,
  usesCookieAuthStorage,
} from '../src/collab/auth-cookies.js'

test('parseCookieHeader decodes refresh token cookie values', () => {
  const cookies = parseCookieHeader({
    headers: {
      cookie: `${REFRESH_TOKEN_COOKIE_NAME}=opaque%2Btoken; other=value`,
    },
  })

  assert.equal(cookies[REFRESH_TOKEN_COOKIE_NAME], 'opaque+token')
  assert.equal(cookies.other, 'value')
})

test('extractRefreshTokenFromRequest prefers body over cookie', () => {
  const token = extractRefreshTokenFromRequest({
    headers: {
      cookie: `${REFRESH_TOKEN_COOKIE_NAME}=cookie-token`,
    },
  }, {
    refreshToken: 'body-token',
  })

  assert.equal(token, 'body-token')
})

test('extractRefreshTokenFromRequest falls back to HttpOnly cookie', () => {
  const token = extractRefreshTokenFromRequest({
    headers: {
      cookie: `${REFRESH_TOKEN_COOKIE_NAME}=cookie-token`,
    },
  }, {})

  assert.equal(token, 'cookie-token')
})

test('usesCookieAuthStorage detects cookie auth header', () => {
  assert.equal(
    usesCookieAuthStorage({
      headers: {
        [AUTH_STORAGE_HEADER]: AUTH_STORAGE_COOKIE_MODE,
      },
    }),
    true,
  )
  assert.equal(usesCookieAuthStorage({ headers: {} }), false)
})

test('buildRefreshTokenCookie uses HttpOnly and auth path', () => {
  const cookie = buildRefreshTokenCookie('refresh-123', {
    req: { headers: { origin: 'https://www.strawmb.com' } },
    maxAgeSec: 3600,
  })

  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Path=\/api\/auth/)
  assert.match(cookie, /Max-Age=3600/)
  assert.match(cookie, /SameSite=None/)
  assert.match(cookie, /Secure/)
})

test('SMB-238: Capacitor https://localhost origin uses cross-site refresh cookie policy', () => {
  const cookie = buildRefreshTokenCookie('refresh-123', {
    req: {
      headers: {
        origin: 'https://localhost',
        host: 'api.strawmb.com',
      },
    },
    maxAgeSec: 3600,
  })

  assert.match(cookie, /SameSite=None/)
  assert.match(cookie, /Secure/)
})

test('SMB-238: same-host local dev origin keeps lax refresh cookie policy', () => {
  const cookie = buildRefreshTokenCookie('refresh-123', {
    req: {
      headers: {
        origin: 'http://localhost:5173',
        host: 'localhost:5173',
      },
    },
    maxAgeSec: 3600,
  })

  assert.match(cookie, /SameSite=Lax/)
  assert.doesNotMatch(cookie, /SameSite=None/)
})

test('buildClearRefreshTokenCookie expires refresh cookie', () => {
  const cookie = buildClearRefreshTokenCookie({
    headers: { origin: 'http://localhost:5173' },
  })

  assert.match(cookie, new RegExp(`${REFRESH_TOKEN_COOKIE_NAME}=`))
  assert.match(cookie, /Max-Age=0/)
})

test('buildAuthSessionResponse omits refresh token in cookie mode', () => {
  const payload = buildAuthSessionResponse({
    accessToken: 'access-1',
    expiresInSec: 900,
    refreshToken: 'refresh-1',
    refreshExpiresInSec: 3600,
    refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    publicProfile: { id: 'user_1' },
  }, { cookieMode: true })

  assert.equal(payload.token, 'access-1')
  assert.equal(payload.user.id, 'user_1')
  assert.equal(payload.refresh_token, undefined)
})

test('buildAuthSessionResponse keeps refresh token in legacy body mode', () => {
  const payload = buildAuthSessionResponse({
    accessToken: 'access-1',
    expiresInSec: 900,
    refreshToken: 'refresh-1',
    refreshExpiresInSec: 3600,
    refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    publicProfile: { id: 'user_1' },
  }, { cookieMode: false })

  assert.equal(payload.refresh_token, 'refresh-1')
})
