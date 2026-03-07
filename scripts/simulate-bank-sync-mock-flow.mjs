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

console.log('--- Simulate: bank link_session (mock) ---')
const link = await callJson(linkSessionHandler, {
  provider: 'mock_bank_tw',
})
assert.equal(link.statusCode, 200)
assert.match(String(link.body?.session_id ?? ''), /^mock_session_/)
assert.match(String(link.body?.mock_code ?? ''), /^mock_/)
console.log({
  provider: link.body.provider,
  sessionId: link.body.session_id,
  mockCode: link.body.mock_code,
})

console.log('--- Simulate: bank exchange (mock) ---')
const exchanged = await callJson(exchangeHandler, {
  provider: 'mock_bank_tw',
  session_id: link.body.session_id,
  code: link.body.mock_code,
})
assert.equal(exchanged.statusCode, 200)
assert.match(String(exchanged.body?.connection_id ?? ''), /^mock_conn_/)
assert.ok(Array.isArray(exchanged.body?.accounts))
assert.ok(exchanged.body.accounts.length >= 1)
console.log({
  provider: exchanged.body.provider,
  connectionId: exchanged.body.connection_id,
  accountCount: exchanged.body.accounts.length,
})

console.log('--- Simulate: bank sync (mock) ---')
const synced = await callJson(syncHandler, {
  provider: 'mock_bank_tw',
  connection_id: exchanged.body.connection_id,
  account_ids: exchanged.body.accounts.map((item) => item.account_id),
  cursor: null,
})
assert.equal(synced.statusCode, 200)
assert.ok(Array.isArray(synced.body?.added))
assert.ok(synced.body.added.length >= exchanged.body.accounts.length)
console.log({
  added: synced.body.added.length,
  nextCursor: synced.body.next_cursor,
})

console.log('--- Simulate: bank mark_imported ---')
const marked = await callJson(markImportedHandler, {
  transactions: synced.body.added.slice(0, 2).map((item, index) => ({
    source_ref: `bank:mock_bank_tw:${item.providerAccountId}:${item.providerTransactionId}`,
    imported_txn_id: `txn_imported_${index + 1}`,
  })),
})
assert.equal(marked.statusCode, 200)
assert.equal(marked.body?.ok, true)
assert.equal(marked.body?.accepted, Math.min(2, synced.body.added.length))
console.log({
  accepted: marked.body.accepted,
})

console.log('--- Simulate: bank disconnect ---')
const disconnected = await callJson(disconnectHandler, {
  provider: 'mock_bank_tw',
  connection_id: exchanged.body.connection_id,
})
assert.equal(disconnected.statusCode, 200)
assert.equal(disconnected.body?.ok, true)
console.log({
  disconnected: disconnected.body.ok,
})
