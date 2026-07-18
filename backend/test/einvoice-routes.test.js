import { describe, it, beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { clearAllSessions } from '../src/einvoice/session-store.js'

const tempDir = await mkdtemp(join(tmpdir(), 'strawmb-einvoice-routes-'))
process.env.SHARED_LEDGER_DB_FILE = join(tempDir, 'collab-store.sqlite')
process.env.SHARED_LEDGER_TOKEN_SECRET = 'test-einvoice-secret'

const {
  createId,
  createLoginSession,
  createUniqueReferralCode,
  findUserByEmail,
  nowIso,
  updateStore,
} = await import('../src/collab/store.js')

function makeResponse(req) {
  const headers = new Map()
  const res = {
    __request: req,
    statusCode: 0,
    payload: null,
    ended: false,
    setHeader(name, value) {
      headers.set(name, value)
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.payload = payload
      return this
    },
    end() {
      this.ended = true
      return this
    },
    getHeader(name) {
      return headers.get(name)
    },
  }
  return res
}

async function callHandler(handler, body, url = '/api/einvoice/query-invoices', headers = {}) {
  const req = {
    method: 'POST',
    url,
    headers: {
      host: 'localhost',
      origin: 'http://localhost:5173',
      ...headers,
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
  }
  const res = makeResponse(req)
  await handler(req, res)
  return res
}

function setEInvoiceEnv() {
  process.env.EINVOICE_CLIENT_SHARED_KEY = 'client-key'
  process.env.EINVOICE_SCRAPE_MOCK = '1'
  process.env.NODE_ENV = 'test'
  process.env.EINVOICE_USER_RATE_LIMIT_MAX_REQUESTS = '100'
  process.env.EINVOICE_SESSION_RATE_LIMIT_MAX_REQUESTS = '100'
}

function clearEInvoiceEnv() {
  delete process.env.EINVOICE_CLIENT_SHARED_KEY
  delete process.env.EINVOICE_SCRAPE_MOCK
  delete process.env.EINVOICE_USER_RATE_LIMIT_MAX_REQUESTS
  delete process.env.EINVOICE_SESSION_RATE_LIMIT_MAX_REQUESTS
}

function futureIso(days = 30) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

async function createUser(email, { member = true } = {}) {
  return updateStore(async (data) => {
    const existing = findUserByEmail(data, email)
    if (existing) return existing
    const now = nowIso()
    const user = {
      id: createId('user'),
      email,
      account: email,
      email_verified: true,
      display_name: email.split('@')[0],
      avatar_url: '',
      referral_code: createUniqueReferralCode(data),
      referred_by_user_id: '',
      referred_by_code: '',
      referral_redeemed_at: '',
      membership_grants: member ? [{
        id: createId('membership_grant'),
        days: 30,
        source: 'test',
        start_at: now,
        end_at: futureIso(),
        created_at: now,
        meta: {},
      }] : [],
      login_failed_attempts: 0,
      last_failed_login_at: '',
      login_locked_until: '',
      must_change_password: false,
      temporary_password_issued_at: '',
      password_reset_required: false,
      password_reset_token_hash: '',
      password_reset_requested_at: '',
      password_reset_expires_at: '',
      password_hash: 'hash',
      password_salt: 'salt',
      last_login_at: now,
      created_at: now,
      updated_at: now,
    }
    data.users.push(user)
    return user
  })
}

async function authHeadersFor(email = 'einvoice-member@example.com', options = {}) {
  const user = await createUser(email, options)
  const session = await createLoginSession(user, {
    issuedByProvider: 'password',
    ipAddress: '127.0.0.1',
    userAgent: 'node:test',
  })
  return {
    'x-straw-client-key': 'client-key',
    authorization: `Bearer ${session.accessToken}`,
  }
}

describe('einvoice routes', { concurrency: 1 }, () => {
  beforeEach(() => {
    clearAllSessions()
    setEInvoiceEnv()
  })

  afterEach(() => {
    clearEInvoiceEnv()
  })

  it('GET /api/einvoice/health reports configured without claiming portal login success', async () => {
    const { default: handler } = await import('../src/routes/einvoice.js?health-probe')
    const req = {
      method: 'GET',
      url: '/api/einvoice/health',
      headers: {
        host: 'localhost',
        origin: 'http://localhost:5173',
      },
      body: undefined,
      socket: { remoteAddress: '127.0.0.1' },
    }
    const res = makeResponse(req)
    await handler(req, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.payload.ok, true)
    assert.equal(res.payload.configured, true)
    assert.equal(res.payload.service, 'einvoice')
    assert.equal(res.payload.note, 'health_ok_does_not_mean_portal_login_ok')
  })

  it('returns explicit configuration error when client key is missing', async () => {
  clearEInvoiceEnv()
  const { default: handler } = await import('../src/routes/einvoice.js?missing-config')

  const res = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/query-invoices', await authHeadersFor('missing-config@example.com'))

  assert.equal(res.statusCode, 503)
  assert.equal(res.payload.error, 'einvoice_not_configured')
  })

  it('rejects missing client shared key header before scraping', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?unauthorized')
  const res = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  })

  assert.equal(res.statusCode, 401)
  assert.equal(res.payload.error, 'unauthorized_client')
  })

  it('rejects missing authenticated user even when shared key is present', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?missing-auth')
  const res = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/query-invoices', { 'x-straw-client-key': 'client-key' })

  assert.equal(res.statusCode, 401)
  assert.equal(res.payload.error, 'unauthorized')
  })

  it('rejects non-member user before scraping', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?membership-required')
  const res = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/query-invoices', await authHeadersFor('einvoice-free@example.com', { member: false }))

  assert.equal(res.statusCode, 403)
  assert.equal(res.payload.error, 'membership_required')
  })

  it('validates carrier phone before scraping', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?invalid-card')
  const res = await callHandler(handler, {
    cardNo: 'ABC1234',
    cardEncrypt: '1234',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/query-invoices', await authHeadersFor('invalid-card@example.com'))

  assert.equal(res.statusCode, 400)
  assert.equal(res.payload.error, 'invalid_phone')
  })

  it('accepts Taiwan mobile phone before scraping', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?symbol-card')
  const res = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/query-invoices', await authHeadersFor('symbol-card@example.com'))

  assert.equal(res.statusCode, 200)
  assert.ok(Array.isArray(res.payload.invoices))
  })

  it('validates date range before scraping', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?invalid-date-range')
  const res = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
    startDate: '2026-05-18',
    endDate: '2026-05-01',
  }, '/api/einvoice/query-invoices', await authHeadersFor('invalid-date@example.com'))

  assert.equal(res.statusCode, 400)
  assert.equal(res.payload.error, 'invalid_date_range')
  })

  it('maps scrape rows to app invoice records via query-invoices alias', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?success')
  const res = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/query-invoices', await authHeadersFor('success@example.com'))

  assert.equal(res.statusCode, 200)
  assert.ok(res.payload.invoices.length >= 1)
  assert.equal(res.payload.invoices[0].carrierName, '手機條碼')
  assert.ok(res.payload.invoices[0].invoiceNumber.startsWith('MOCK'))
  })

  it('scrape flow supports captcha then query', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?scrape-flow')

  const startRes = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
    force_captcha: true,
  }, '/api/einvoice/scrape/start', await authHeadersFor('scrape-flow@example.com'))

  assert.equal(startRes.statusCode, 200)
  assert.equal(startRes.payload.needs_captcha, true)
  assert.ok(startRes.payload.session_id)

  const captchaRes = await callHandler(handler, {
    session_id: startRes.payload.session_id,
    captcha_code: 'ABCD',
  }, '/api/einvoice/scrape/captcha', await authHeadersFor('scrape-flow@example.com'))

  assert.equal(captchaRes.statusCode, 200)
  assert.equal(captchaRes.payload.ok, true)

  const queryRes = await callHandler(handler, {
    session_id: startRes.payload.session_id,
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/scrape/query', await authHeadersFor('scrape-flow@example.com'))

  assert.equal(queryRes.statusCode, 200)
  assert.ok(queryRes.payload.invoices.length >= 1)
  })

  it('scrape query maps auth failure from mock provider', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?auth-fail')
  const startRes = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'badauth',
    force_captcha: false,
  }, '/api/einvoice/scrape/start', await authHeadersFor('auth-fail@example.com'))

  const queryRes = await callHandler(handler, {
    session_id: startRes.payload.session_id,
    cardNo: '0910047171',
    cardEncrypt: 'badauth',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/scrape/query', await authHeadersFor('auth-fail@example.com'))

  assert.equal(queryRes.statusCode, 401)
  assert.equal(queryRes.payload.error, 'einvoice_auth_failed')
  })

  it('scrape cancel releases session', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?cancel')
  const startRes = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
  }, '/api/einvoice/scrape/start', await authHeadersFor('cancel@example.com'))

  const cancelRes = await callHandler(handler, {
    session_id: startRes.payload.session_id,
  }, '/api/einvoice/scrape/cancel', await authHeadersFor('cancel@example.com'))

  assert.equal(cancelRes.statusCode, 200)
  assert.equal(cancelRes.payload.ok, true)
  })

  it('limits one active scrape session per user until cancel cleanup', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?concurrent-limit')
  const headers = await authHeadersFor('concurrent@example.com')
  const first = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
  }, '/api/einvoice/scrape/start', headers)

  assert.equal(first.statusCode, 200)

  const second = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
  }, '/api/einvoice/scrape/start', headers)

  assert.equal(second.statusCode, 429)
  assert.equal(second.payload.error, 'einvoice_concurrent_limit')

  await callHandler(handler, {
    session_id: first.payload.session_id,
  }, '/api/einvoice/scrape/cancel', headers)

  const third = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
  }, '/api/einvoice/scrape/start', headers)

  assert.equal(third.statusCode, 200)
  })

  it('applies user/session route rate limit after auth and membership checks', async () => {
  process.env.EINVOICE_USER_RATE_LIMIT_MAX_REQUESTS = '1'
  process.env.EINVOICE_SESSION_RATE_LIMIT_MAX_REQUESTS = '100'
  const { default: handler } = await import('../src/routes/einvoice.js?route-rate-limit')
  const headers = await authHeadersFor('rate-limited@example.com')

  const first = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/query-invoices', headers)
  const second = await callHandler(handler, {
    cardNo: '0910047171',
    cardEncrypt: 'Swxd3167@',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/query-invoices', headers)

  assert.equal(first.statusCode, 200)
  assert.equal(second.statusCode, 429)
  assert.equal(second.payload.error, 'einvoice_rate_limited')
  })
})

after(async () => {
  await rm(tempDir, { recursive: true, force: true })
})
