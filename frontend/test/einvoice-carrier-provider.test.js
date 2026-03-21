import test from 'node:test'
import assert from 'node:assert/strict'

import { decodeEinvoiceSessionToken, encodeEinvoiceSessionToken } from '../api/einvoice/_mobile-barcode-provider.js'

test('encodeEinvoiceSessionToken and decodeEinvoiceSessionToken round-trip storage state', () => {
  const storageState = {
    cookies: [{ name: 'sid', value: 'abc', domain: 'www.einvoice.nat.gov.tw', path: '/' }],
    origins: [{ origin: 'https://www.einvoice.nat.gov.tw', localStorage: [{ name: 'token', value: '123' }] }],
  }

  const token = encodeEinvoiceSessionToken(storageState)
  assert.deepEqual(decodeEinvoiceSessionToken(token), storageState)
})

test('decodeEinvoiceSessionToken rejects malformed tokens as session expiry', () => {
  assert.throws(
    () => decodeEinvoiceSessionToken('not-a-valid-token'),
    /Session 已失效/,
  )
})
