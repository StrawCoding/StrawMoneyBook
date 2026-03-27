import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  createEinvoiceLinkSession,
  getEinvoiceCarrierApiUnavailableMessage,
  isEinvoiceCarrierApiConfigured,
  isEinvoiceCarrierFeatureEnabled,
  listEinvoiceCarrierProviders,
} from '../src/services/einvoice-carrier/backend.js'

test('web runtime keeps e-invoice carrier feature disabled outside Android app', () => {
  assert.equal(isEinvoiceCarrierApiConfigured(), false)
  assert.equal(isEinvoiceCarrierFeatureEnabled(), false)
  assert.deepEqual(listEinvoiceCarrierProviders(), [])
  assert.match(getEinvoiceCarrierApiUnavailableMessage(), /Android App/i)
})

test('createEinvoiceLinkSession rejects when Android native automation is unavailable', async () => {
  await assert.rejects(
    () => createEinvoiceLinkSession(),
    /Android App/i,
  )
})

test('e-invoice backend routes auth through Android native automation instead of hosted fetch api', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../src/services/einvoice-carrier/backend.js'), 'utf8')

  assert.match(source, /connectNativeEinvoiceCarrier/)
  assert.match(source, /syncNativeEinvoiceCarrier/)
  assert.match(source, /disconnectNativeEinvoiceCarrier/)
  assert.doesNotMatch(source, /VITE_EINVOICE_API_BASE_URL/)
  assert.doesNotMatch(source, /fetch\(/)
  assert.doesNotMatch(source, /\/api\/einvoice\/exchange/)
})
