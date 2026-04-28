import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tempDir = await mkdtemp(join(tmpdir(), 'strawmb-auth-reset-failure-'))
process.env.SHARED_LEDGER_DB_FILE = join(tempDir, 'collab-store.sqlite')
process.env.SHARED_LEDGER_TOKEN_SECRET = 'test-auth-reset-failure-secret'
process.env.SHARED_LEDGER_DEBUG_PASSWORD_RESET = '1'
delete process.env.SMTP_JSON_TRANSPORT
delete process.env.SMTP_URL
delete process.env.SMTP_HOST
delete process.env.SMTP_SERVER
delete process.env.SMTP_FROM

const authHandler = (await import('../src/routes/auth.js')).default

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

async function sendAuthRequest({ method, url, body }) {
  const req = {
    method,
    url,
    headers: { host: 'localhost' },
    body: body == null ? '' : JSON.stringify(body),
  }
  const res = createMockResponse(req)
  await authHandler(req, res)
  return res
}

test.after(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

test('password reset request rolls back temporary password when email delivery fails', async () => {
  const email = 'reset-failure@example.com'
  const password = 'password123'
  const registerRes = await sendAuthRequest({
    method: 'POST',
    url: '/api/auth/register',
    body: {
      email,
      password,
      displayName: 'Reset Failure',
    },
  })
  assert.equal(registerRes.statusCode, 201)

  const resetRes = await sendAuthRequest({
    method: 'POST',
    url: '/api/auth/password-reset/request',
    body: { email },
  })
  assert.notEqual(resetRes.statusCode, 200)

  const loginRes = await sendAuthRequest({
    method: 'POST',
    url: '/api/auth/login',
    body: { email, password },
  })
  assert.equal(loginRes.statusCode, 200)
  assert.equal(loginRes.body?.user?.email, email)
})
