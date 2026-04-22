import test from 'node:test'
import assert from 'node:assert/strict'

import invoiceHandler, { resolveInvoiceRoute } from '../src/routes/invoice/index.js'
import { resolveRouteHandler } from '../src/routes/route-table.js'

const ORIGINAL_INVOICE_PROVIDER_MODE = process.env.INVOICE_CARRIER_PROVIDER_MODE
const ORIGINAL_INVOICE_CLIENT_KEY = process.env.INVOICE_CARRIER_CLIENT_SHARED_KEY
const ORIGINAL_BANK_CLIENT_KEY = process.env.BANK_SYNC_CLIENT_SHARED_KEY

test.after(() => {
  restoreEnv()
})

function restoreEnv() {
  setEnvValue('INVOICE_CARRIER_PROVIDER_MODE', ORIGINAL_INVOICE_PROVIDER_MODE)
  setEnvValue('INVOICE_CARRIER_CLIENT_SHARED_KEY', ORIGINAL_INVOICE_CLIENT_KEY)
  setEnvValue('BANK_SYNC_CLIENT_SHARED_KEY', ORIGINAL_BANK_CLIENT_KEY)
}

function setEnvValue(key, value) {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}

function createMockResponse(req) {
  return {
    __request: req,
    headers: {},
    statusCode: 200,
    body: null,
    ended: null,
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
    end(payload = '') {
      this.ended = payload
      return this
    },
  }
}

async function sendInvoiceRequest({ method = 'POST', url, body, headers = {} }) {
  const req = {
    method,
    url,
    headers: {
      host: 'localhost',
      origin: 'capacitor://localhost',
      ...headers,
    },
    body: body === undefined ? '' : JSON.stringify(body),
  }
  const res = createMockResponse(req)
  await invoiceHandler(req, res)
  return res
}

test('invoice route table exposes /api/invoice/link_session', () => {
  const route = resolveRouteHandler('/api/invoice/link_session')
  assert.equal(route?.prefix, '/api/invoice')
  assert.equal(typeof route?.handler, 'function')

  const invoiceRoute = resolveInvoiceRoute('POST', '/link_session')
  assert.equal(typeof invoiceRoute?.handler, 'function')
})

test('invoice route handles OPTIONS with X-Straw-Client-Key in CORS headers', async () => {
  restoreEnv()
  const res = await sendInvoiceRequest({
    method: 'OPTIONS',
    url: '/api/invoice/link_session',
    headers: {
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,x-straw-client-key',
    },
  })

  assert.equal(res.statusCode, 204)
  assert.match(res.headers['Access-Control-Allow-Headers'], /X-Straw-Client-Key/)
  assert.match(res.headers['Access-Control-Allow-Methods'], /POST/)
})

test('invoice route requires client key when configured', async () => {
  restoreEnv()
  process.env.INVOICE_CARRIER_CLIENT_SHARED_KEY = 'invoice-secret'
  process.env.INVOICE_CARRIER_PROVIDER_MODE = 'mock'

  const denied = await sendInvoiceRequest({
    url: '/api/invoice/link_session',
    body: {},
  })
  assert.equal(denied.statusCode, 401)
  assert.equal(denied.body?.error, 'unauthorized_client')

  const allowed = await sendInvoiceRequest({
    url: '/api/invoice/link_session',
    headers: {
      'x-straw-client-key': 'invoice-secret',
    },
    body: {},
  })
  assert.equal(allowed.statusCode, 200)
  assert.match(allowed.body?.session_id, /^mock_einv_/)
})

test('invoice route mock provider returns JSON across link, status, exchange, sync and disconnect', async () => {
  restoreEnv()
  process.env.INVOICE_CARRIER_PROVIDER_MODE = 'mock'
  delete process.env.INVOICE_CARRIER_CLIENT_SHARED_KEY
  delete process.env.BANK_SYNC_CLIENT_SHARED_KEY

  const link = await sendInvoiceRequest({
    url: '/api/invoice/link_session',
    body: {},
  })
  assert.equal(link.statusCode, 200)
  assert.equal(link.body?.provider, 'einvoice_tw')
  assert.match(link.body?.session_id, /^mock_einv_/)

  const status = await sendInvoiceRequest({
    url: '/api/invoice/session_status',
    body: { session_id: link.body.session_id },
  })
  assert.equal(status.statusCode, 200)
  assert.equal(status.body?.login_form_ready, true)

  const exchange = await sendInvoiceRequest({
    url: '/api/invoice/exchange',
    body: {
      session_id: link.body.session_id,
      mobile_phone: '0912345678',
      password: 'secret',
      captcha_code: '1234',
    },
  })
  assert.equal(exchange.statusCode, 200)
  assert.equal(exchange.body?.mobile_phone, '0912345678')
  assert.deepEqual(exchange.body?.storage_state, { cookies: [], origins: [] })

  const sync = await sendInvoiceRequest({
    url: '/api/invoice/sync',
    body: {
      connection_id: 'invoice-conn-1',
      storage_state: exchange.body.storage_state,
      credentials: {
        mobile_phone: '0912345678',
        password: 'secret',
      },
    },
  })
  assert.equal(sync.statusCode, 200)
  assert.equal(sync.body?.connection_id, 'invoice-conn-1')
  assert.deepEqual(sync.body?.invoices, [])

  const disconnect = await sendInvoiceRequest({
    url: '/api/invoice/disconnect',
    body: { session_id: link.body.session_id },
  })
  assert.equal(disconnect.statusCode, 200)
  assert.equal(disconnect.body?.ok, true)
})
