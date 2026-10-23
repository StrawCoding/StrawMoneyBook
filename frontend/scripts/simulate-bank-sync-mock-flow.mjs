import assert from 'node:assert/strict'
import linkSessionHandler from '../api/bank/link_session.js'
import exchangeHandler from '../api/bank/exchange.js'
import syncHandler from '../api/bank/sync.js'
import disconnectHandler from '../api/bank/disconnect.js'
import markImportedHandler from '../api/bank/mark_imported.js'

function createRequest(body = {}) {
  return {
    method: 'POST',
    headers: {},
    body: JSON.stringify(body),
  }
}

function createResponse() {
  let bodyText = ''
  const headers = new Map()
  return {
    statusCode: 200,
    setHeader(name, value) {
      headers.set(String(name), value)
    },
    getHeader(name) {
      return headers.get(String(name))
    },
    status(code) {
      this.statusCode = Number(code) || 200
      return this
    },
    json(payload) {
      bodyText = JSON.stringify(payload)
      return this
    },
    end(payload = '') {
      bodyText = String(payload ?? '')
      return this
    },
    get bodyText() {
      return bodyText
    },
  }
}

async function callJson(handler, payload) {
  const req = createRequest(payload)
  const res = createResponse()
  await handler(req, res)
  const text = String(res.bodyText ?? '').trim()
  return {
    statusCode: res.statusCode,
    body: text ? JSON.parse(text) : null,
  }
}

function assertRetiredRemoteProvider(label, result) {
  assert.equal(result.statusCode, 501, `${label} must retire remote scrape with 501`)
  assert.equal(result.body?.error, 'provider_not_supported')
  assert.match(String(result.body?.message ?? ''), /目前未開放/)
  console.log({
    label,
    statusCode: result.statusCode,
    error: result.body?.error,
    message: result.body?.message,
  })
}

console.log('--- Simulate: retired remote bank APIs return 501 ---')
assertRetiredRemoteProvider(
  'link_session',
  await callJson(linkSessionHandler, { provider: 'mock_bank_tw' }),
)
assertRetiredRemoteProvider(
  'exchange',
  await callJson(exchangeHandler, {
    provider: 'mock_bank_tw',
    session_id: 'mock_session_retired',
    code: 'mock_code_retired',
  }),
)
assertRetiredRemoteProvider(
  'sync',
  await callJson(syncHandler, {
    provider: 'mock_bank_tw',
    connection_id: 'mock_conn_retired',
    account_ids: ['acct_retired'],
    cursor: null,
  }),
)
assertRetiredRemoteProvider(
  'disconnect',
  await callJson(disconnectHandler, {
    provider: 'mock_bank_tw',
    connection_id: 'mock_conn_retired',
  }),
)

console.log('--- Simulate: mark_imported remains a local ledger ack ---')
const marked = await callJson(markImportedHandler, {
  transactions: [{
    source_ref: 'bank:mock_bank_tw:acct_retired:txn_retired',
    imported_txn_id: 'txn_imported_1',
  }],
})
assert.equal(marked.statusCode, 200)
assert.equal(marked.body?.ok, true)
assert.equal(marked.body?.accepted, 1)
console.log({ accepted: marked.body.accepted })

console.log('Bank remote scrape APIs correctly return 501 provider_not_supported')
