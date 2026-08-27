import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveEInvoiceApiConfigured } from '../src/services/einvoice/shared.js'

test('e-invoice configured requires both API base and client key', () => {
  assert.equal(resolveEInvoiceApiConfigured({ apiBase: '', clientKey: '' }), false)
  assert.equal(resolveEInvoiceApiConfigured({ apiBase: 'https://api.strawmb.com', clientKey: '' }), false)
  assert.equal(resolveEInvoiceApiConfigured({ apiBase: '', clientKey: 'secret' }), false)
  assert.equal(resolveEInvoiceApiConfigured({
    apiBase: 'https://api.strawmb.com',
    clientKey: 'secret',
  }), true)
})
