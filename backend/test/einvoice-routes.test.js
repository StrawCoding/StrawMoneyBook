import test from 'node:test'
import assert from 'node:assert/strict'

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
  process.env.EINVOICE_APP_ID = 'app-id'
  process.env.EINVOICE_API_KEY = 'api-key'
  process.env.EINVOICE_CLIENT_SHARED_KEY = 'client-key'
}

function clearEInvoiceEnv() {
  delete process.env.EINVOICE_APP_ID
  delete process.env.EINVOICE_API_KEY
  delete process.env.EINVOICE_CLIENT_SHARED_KEY
}

const authHeaders = { 'x-straw-client-key': 'client-key' }

test('einvoice route returns explicit configuration error when API credentials are missing', async () => {
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

test('einvoice route rejects missing client shared key header before proxying', async () => {
  setEInvoiceEnv()
  const originalFetch = globalThis.fetch
  let fetchCalled = false
  globalThis.fetch = async () => {
    fetchCalled = true
    throw new Error('should not call fetch for unauthorized client')
  }

  try {
    const { default: handler } = await import('../src/routes/einvoice.js?unauthorized')
    const res = await callHandler(handler, {
      cardNo: '/ABC1234',
      cardEncrypt: '1234',
      startDate: '2026-05-01',
      endDate: '2026-05-18',
    })

    assert.equal(res.statusCode, 401)
    assert.equal(res.payload.error, 'unauthorized_client')
    assert.equal(fetchCalled, false)
  } finally {
    globalThis.fetch = originalFetch
    clearEInvoiceEnv()
  }
})

test('einvoice route validates mobile barcode before calling Ministry API', async () => {
  setEInvoiceEnv()
  const originalFetch = globalThis.fetch
  let fetchCalled = false
  globalThis.fetch = async () => {
    fetchCalled = true
    throw new Error('should not call fetch for invalid input')
  }

  try {
    const { default: handler } = await import('../src/routes/einvoice.js?invalid-card')
    const res = await callHandler(handler, {
      cardNo: 'ABC1234',
      cardEncrypt: '1234',
      startDate: '2026-05-01',
      endDate: '2026-05-18',
    }, '/api/einvoice/query-invoices', authHeaders)

    assert.equal(res.statusCode, 400)
    assert.equal(res.payload.error, 'invalid_card_no')
    assert.equal(fetchCalled, false)
  } finally {
    globalThis.fetch = originalFetch
    clearEInvoiceEnv()
  }
})

test('einvoice route accepts Ministry mobile barcode symbols before proxying', async () => {
  setEInvoiceEnv()
  const originalFetch = globalThis.fetch
  let requestBody = ''
  globalThis.fetch = async (_url, options) => {
    requestBody = String(options?.body ?? '')
    return {
      ok: true,
      async json() {
        return { code: '200', v2InvPageCnt: 1, details: [] }
      },
    }
  }

  try {
    const { default: handler } = await import('../src/routes/einvoice.js?symbol-card')
    const res = await callHandler(handler, {
      cardNo: '/A+.-123',
      cardEncrypt: '1234',
      startDate: '2026-05-01',
      endDate: '2026-05-18',
    }, '/api/einvoice/query-invoices', authHeaders)

    assert.equal(res.statusCode, 200)
    assert.match(requestBody, /cardNo=%2FA%2B\.-123/)
  } finally {
    globalThis.fetch = originalFetch
    clearEInvoiceEnv()
  }
})

test('einvoice route validates date range before calling Ministry API', async () => {
  setEInvoiceEnv()
  const originalFetch = globalThis.fetch
  let fetchCalled = false
  globalThis.fetch = async () => {
    fetchCalled = true
    throw new Error('should not call fetch for invalid date range')
  }

  try {
    const { default: handler } = await import('../src/routes/einvoice.js?invalid-date-range')
    const res = await callHandler(handler, {
      cardNo: '/ABC1234',
      cardEncrypt: '1234',
      startDate: '2026-05-18',
      endDate: '2026-05-01',
    }, '/api/einvoice/query-invoices', authHeaders)

    assert.equal(res.statusCode, 400)
    assert.equal(res.payload.error, 'invalid_date_range')
    assert.equal(fetchCalled, false)
  } finally {
    globalThis.fetch = originalFetch
    clearEInvoiceEnv()
  }
})

test('einvoice route maps Ministry API detail rows to app invoice records', async () => {
  setEInvoiceEnv()
  const originalFetch = globalThis.fetch
  let requestBody = ''
  globalThis.fetch = async (_url, options) => {
    requestBody = String(options?.body ?? '')
    return {
      ok: true,
      async json() {
        return {
          code: '200',
          v2InvPageCnt: 1,
          details: [
            {
              invNum: 'AB12345678',
              amount: '1,250',
              invDate: '2026/05/18',
              sellerName: '測試商店',
              invStatus: '已開立',
            },
          ],
        }
      },
    }
  }

  try {
    const { default: handler } = await import('../src/routes/einvoice.js?success')
    const res = await callHandler(handler, {
      cardNo: '/ABC1234',
      cardEncrypt: '1234',
      startDate: '2026-05-01',
      endDate: '2026-05-18',
    }, '/api/einvoice/query-invoices', authHeaders)

    assert.equal(res.statusCode, 200)
    assert.equal(res.payload.invoices.length, 1)
    assert.deepEqual(res.payload.invoices[0], {
      invoiceNumber: 'AB12345678',
      amount: 1250,
      invoiceDate: new Date('2026-05-18T00:00:00+08:00').getTime(),
      merchantName: '測試商店',
      carrierName: '手機條碼',
      invStatus: '已開立',
    })
    assert.match(requestBody, /action=carrierInvChk/)
    assert.match(requestBody, /cardNo=%2FABC1234/)
    assert.match(requestBody, /cardEncrypt=1234/)
    assert.match(requestBody, /startDate=2026%2F05%2F01/)
  } finally {
    globalThis.fetch = originalFetch
    clearEInvoiceEnv()
  }
})

test('einvoice route refuses silent truncation when Ministry API has too many pages', async () => {
  setEInvoiceEnv()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { code: '200', v2InvPageCnt: 21, details: [] }
    },
  })

  try {
    const { default: handler } = await import('../src/routes/einvoice.js?too-many-pages')
    const res = await callHandler(handler, {
      cardNo: '/ABC1234',
      cardEncrypt: '1234',
      startDate: '2026-05-01',
      endDate: '2026-05-18',
    }, '/api/einvoice/query-invoices', authHeaders)

    assert.equal(res.statusCode, 413)
    assert.equal(res.payload.error, 'einvoice_result_too_large')
    assert.equal(res.payload.maxPages, 20)
  } finally {
    globalThis.fetch = originalFetch
    clearEInvoiceEnv()
  }
})
