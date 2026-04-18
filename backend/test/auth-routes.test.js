import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tempDir = await mkdtemp(join(tmpdir(), 'strawmb-auth-routes-'))
process.env.SHARED_LEDGER_DB_FILE = join(tempDir, 'collab-store.sqlite')
process.env.SHARED_LEDGER_TOKEN_SECRET = 'test-auth-routes-secret'
process.env.SMTP_JSON_TRANSPORT = '1'
process.env.SHARED_LEDGER_DEBUG_PASSWORD_RESET = '1'

const authModule = await import('../src/routes/auth.js')
const authHandler = authModule.default
const { setAuthGoogleIdTokenVerifier } = authModule

function createMockResponse(req) {
  return {
    __request: req,
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value
    },
    getHeader(name) {
      return this.headers[name]
    },
    status(code) {
      this.statusCode = Number(code) || 200
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    end(payload) {
      this.ended = payload
      return this
    },
  }
}

async function sendAuthRequest({ method, url, body, token }) {
  const req = {
    method,
    url,
    headers: {
      host: 'localhost',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body == null ? '' : JSON.stringify(body),
  }
  const res = createMockResponse(req)
  await authHandler(req, res)
  return res
}

test.after(async () => {
  setAuthGoogleIdTokenVerifier(null)
  await rm(tempDir, { recursive: true, force: true })
})

test('auth routes support register, login, refresh, and password reset request flows', async () => {
  const registerRes = await sendAuthRequest({
    method: 'POST',
    url: '/api/auth/register',
    body: {
      email: 'route-user@example.com',
      password: 'password123',
      displayName: 'Route User',
    },
  })

  assert.equal(registerRes.statusCode, 201)
  assert.equal(registerRes.body?.user?.email, 'route-user@example.com')
  assert.ok(registerRes.body?.refresh_token)

  const loginRes = await sendAuthRequest({
    method: 'POST',
    url: '/api/auth/login',
    body: {
      email: 'route-user@example.com',
      password: 'password123',
    },
  })

  assert.equal(loginRes.statusCode, 200)
  assert.equal(loginRes.body?.user?.email, 'route-user@example.com')
  assert.ok(loginRes.body?.refresh_token)

  const refreshRes = await sendAuthRequest({
    method: 'POST',
    url: '/api/auth/refresh',
    body: {
      refreshToken: loginRes.body?.refresh_token,
    },
  })

  assert.equal(refreshRes.statusCode, 200)
  assert.notEqual(refreshRes.body?.refresh_token, loginRes.body?.refresh_token)

  const resetRes = await sendAuthRequest({
    method: 'POST',
    url: '/api/auth/password-reset/request',
    body: {
      email: 'route-user@example.com',
    },
  })

  assert.equal(resetRes.statusCode, 200)
  assert.ok(String(resetRes.body?.debug_temporary_password ?? '').trim())

  const tempLoginRes = await sendAuthRequest({
    method: 'POST',
    url: '/api/auth/login',
    body: {
      email: 'route-user@example.com',
      password: resetRes.body?.debug_temporary_password,
    },
  })

  assert.equal(tempLoginRes.statusCode, 200)
  assert.equal(tempLoginRes.body?.user?.email, 'route-user@example.com')
})

test('auth routes support google prepare and google login through the route dispatcher', async () => {
  setAuthGoogleIdTokenVerifier(async ({ expectedNonce }) => ({
    sub: 'google-sub-route-test',
    email: 'google-route@example.com',
    email_verified: true,
    name: 'Google Route User',
    picture: 'https://example.com/avatar.png',
    nonce: expectedNonce,
  }))

  const prepareRes = await sendAuthRequest({
    method: 'POST',
    url: '/api/auth/google/prepare',
    body: { purpose: 'login' },
  })

  assert.equal(prepareRes.statusCode, 200)
  assert.ok(String(prepareRes.body?.nonce ?? '').trim())

  const googleRes = await sendAuthRequest({
    method: 'POST',
    url: '/api/auth/google',
    body: {
      idToken: 'google-test-token',
      nonce: prepareRes.body?.nonce,
      purpose: 'login',
    },
  })

  assert.equal(googleRes.statusCode, 200)
  assert.equal(googleRes.body?.user?.email, 'google-route@example.com')
  assert.equal(googleRes.body?.user?.auth_providers?.[0]?.provider, 'google')

  setAuthGoogleIdTokenVerifier(null)
})
