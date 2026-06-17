import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { clearAllSessions } from '../src/einvoice/session-store.js'

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
}

function clearEInvoiceEnv() {
  delete process.env.EINVOICE_CLIENT_SHARED_KEY
  delete process.env.EINVOICE_SCRAPE_MOCK
}

const authHeaders = { 'x-straw-client-key': 'client-key' }

describe('einvoice routes', { concurrency: 1 }, () => {
  beforeEach(() => {
    clearAllSessions()
    setEInvoiceEnv()
  })

  afterEach(() => {
    clearEInvoiceEnv()
  })

  it('returns explicit configuration error when client key is missing', async () => {
  clearEInvoiceEnv()
  const { default: handler } = await import('../src/routes/einvoice.js?missing-config')

  const res = await callHandler(handler, {
    cardNo: '/ABC1234',
    cardEncrypt: '1234',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/query-invoices', authHeaders)

  assert.equal(res.statusCode, 503)
  assert.equal(res.payload.error, 'einvoice_not_configured')
  })

  it('rejects missing client shared key header before scraping', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?unauthorized')
  const res = await callHandler(handler, {
    cardNo: '/ABC1234',
    cardEncrypt: '1234',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  })

  assert.equal(res.statusCode, 401)
  assert.equal(res.payload.error, 'unauthorized_client')
  })

  it('validates mobile barcode before scraping', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?invalid-card')
  const res = await callHandler(handler, {
    cardNo: 'ABC1234',
    cardEncrypt: '1234',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/query-invoices', authHeaders)

  assert.equal(res.statusCode, 400)
  assert.equal(res.payload.error, 'invalid_card_no')
  })

  it('accepts Ministry mobile barcode symbols before scraping', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?symbol-card')
  const res = await callHandler(handler, {
    cardNo: '/A+.-123',
    cardEncrypt: '1234',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/query-invoices', authHeaders)

  assert.equal(res.statusCode, 200)
  assert.ok(Array.isArray(res.payload.invoices))
  })

  it('validates date range before scraping', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?invalid-date-range')
  const res = await callHandler(handler, {
    cardNo: '/ABC1234',
    cardEncrypt: '1234',
    startDate: '2026-05-18',
    endDate: '2026-05-01',
  }, '/api/einvoice/query-invoices', authHeaders)

  assert.equal(res.statusCode, 400)
  assert.equal(res.payload.error, 'invalid_date_range')
  })

  it('maps scrape rows to app invoice records via query-invoices alias', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?success')
  const res = await callHandler(handler, {
    cardNo: '/ABC1234',
    cardEncrypt: '1234',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/query-invoices', authHeaders)

  assert.equal(res.statusCode, 200)
  assert.ok(res.payload.invoices.length >= 1)
  assert.equal(res.payload.invoices[0].carrierName, '手機條碼')
  assert.ok(res.payload.invoices[0].invoiceNumber.startsWith('MOCK'))
  })

  it('scrape flow supports captcha then query', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?scrape-flow')

  const startRes = await callHandler(handler, {
    cardNo: '/ABC1234',
    cardEncrypt: '1234',
    force_captcha: true,
  }, '/api/einvoice/scrape/start', authHeaders)

  assert.equal(startRes.statusCode, 200)
  assert.equal(startRes.payload.needs_captcha, true)
  assert.ok(startRes.payload.session_id)

  const captchaRes = await callHandler(handler, {
    session_id: startRes.payload.session_id,
    captcha_code: 'ABCD',
  }, '/api/einvoice/scrape/captcha', authHeaders)

  assert.equal(captchaRes.statusCode, 200)
  assert.equal(captchaRes.payload.ok, true)

  const queryRes = await callHandler(handler, {
    session_id: startRes.payload.session_id,
    cardNo: '/ABC1234',
    cardEncrypt: '1234',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/scrape/query', authHeaders)

  assert.equal(queryRes.statusCode, 200)
  assert.ok(queryRes.payload.invoices.length >= 1)
  })

  it('scrape query maps auth failure from mock provider', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?auth-fail')
  const startRes = await callHandler(handler, {
    cardNo: '/ABC1234',
    cardEncrypt: 'badauth',
    force_captcha: false,
  }, '/api/einvoice/scrape/start', authHeaders)

  const queryRes = await callHandler(handler, {
    session_id: startRes.payload.session_id,
    cardNo: '/ABC1234',
    cardEncrypt: 'badauth',
    startDate: '2026-05-01',
    endDate: '2026-05-18',
  }, '/api/einvoice/scrape/query', authHeaders)

  assert.equal(queryRes.statusCode, 401)
  assert.equal(queryRes.payload.error, 'einvoice_auth_failed')
  })

  it('scrape cancel releases session', async () => {
  const { default: handler } = await import('../src/routes/einvoice.js?cancel')
  const startRes = await callHandler(handler, {
    cardNo: '/ABC1234',
    cardEncrypt: '1234',
  }, '/api/einvoice/scrape/start', authHeaders)

  const cancelRes = await callHandler(handler, {
    session_id: startRes.payload.session_id,
  }, '/api/einvoice/scrape/cancel', authHeaders)

  assert.equal(cancelRes.statusCode, 200)
  assert.equal(cancelRes.payload.ok, true)
  })
})
