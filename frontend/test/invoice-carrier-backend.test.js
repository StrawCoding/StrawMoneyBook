import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  isInvoiceCarrierLinkingSupportedFor,
  isInvoiceCarrierApiConfiguredFor,
} from '../src/services/invoice-carrier/backend.js'

const backendAdapterSource = readFileSync(resolve(import.meta.dirname, '../src/services/invoice-carrier/backend.js'), 'utf8')

test('invoice carrier product path is configured only on Android runtime', () => {
  assert.equal(
    isInvoiceCarrierApiConfiguredFor({
      platform: 'android',
    }),
    true,
  )

  assert.equal(
    isInvoiceCarrierApiConfiguredFor({
      platform: 'web',
    }),
    false,
  )

  assert.equal(
    isInvoiceCarrierApiConfiguredFor({
      platform: 'ios',
    }),
    false,
  )
})

test('invoice carrier linking is supported only on Android runtime', () => {
  assert.equal(
    isInvoiceCarrierLinkingSupportedFor({
      platform: 'android',
    }),
    true,
  )

  assert.equal(
    isInvoiceCarrierLinkingSupportedFor({
      platform: 'web',
    }),
    false,
  )
})

test('invoice carrier backend source explicitly documents Android-only diagnostics for web', () => {
  assert.match(backendAdapterSource, /Android App 自動化/)
  assert.match(backendAdapterSource, /不能新增、重新驗證或同步載具/)
  assert.match(backendAdapterSource, /createNativeInvoiceCarrierLinkSession/)
  assert.match(backendAdapterSource, /getNativeInvoiceCarrierSessionStatus/)
  assert.match(backendAdapterSource, /exchangeNativeInvoiceCarrierAuth/)
})
