import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isInvoiceCarrierApiConfiguredFor,
  resolveInvoiceCarrierApiBase,
  resolveInvoiceCarrierClientSharedKey,
  shouldUseSameOriginLocalInvoiceApi,
} from '../src/services/invoice-carrier/backend.js'

test('invoice carrier adapter reuses shared-ledger api base on native runtime', () => {
  assert.equal(
    resolveInvoiceCarrierApiBase({
      env: {
        VITE_SHARED_LEDGER_API_BASE_URL: 'https://api.example.com',
      },
      platform: 'android',
      windowRef: null,
    }),
    'https://api.example.com',
  )

  assert.equal(
    isInvoiceCarrierApiConfiguredFor({
      env: {
        VITE_SHARED_LEDGER_API_BASE_URL: 'https://api.example.com',
      },
      platform: 'android',
      windowRef: null,
    }),
    true,
  )
})

test('invoice carrier adapter falls back to the production StrawMB api host when native invoice api base is omitted', () => {
  assert.equal(
    resolveInvoiceCarrierApiBase({
      env: {
        PROD: true,
      },
      platform: 'android',
      windowRef: null,
    }),
    'https://api.strawmb.com',
  )
})

test('invoice carrier adapter keeps same-origin local api routing on localhost web preview', () => {
  assert.equal(
    shouldUseSameOriginLocalInvoiceApi({
      env: {},
      platform: 'web',
      windowRef: {
        location: {
          origin: 'http://127.0.0.1:4173',
        },
      },
    }),
    true,
  )

  assert.equal(
    resolveInvoiceCarrierApiBase({
      env: {},
      platform: 'web',
      windowRef: {
        location: {
          origin: 'http://127.0.0.1:4173',
        },
      },
    }),
    '',
  )

  assert.equal(
    isInvoiceCarrierApiConfiguredFor({
      env: {},
      platform: 'web',
      windowRef: {
        location: {
          origin: 'http://127.0.0.1:4173',
        },
      },
    }),
    true,
  )
})

test('invoice carrier adapter keeps same-origin api routing on StrawMB web to avoid cross-origin fetch failures', () => {
  assert.equal(
    shouldUseSameOriginLocalInvoiceApi({
      env: {
        PROD: true,
      },
      platform: 'web',
      windowRef: {
        location: {
          origin: 'https://www.strawmb.com',
        },
      },
    }),
    true,
  )

  assert.equal(
    resolveInvoiceCarrierApiBase({
      env: {
        PROD: true,
      },
      platform: 'web',
      windowRef: {
        location: {
          origin: 'https://www.strawmb.com',
        },
      },
    }),
    '',
  )

  assert.equal(
    isInvoiceCarrierApiConfiguredFor({
      env: {
        PROD: true,
      },
      platform: 'web',
      windowRef: {
        location: {
          origin: 'https://www.strawmb.com',
        },
      },
    }),
    true,
  )
})

test('invoice carrier adapter falls back to bank sync shared key for guarded api routes', () => {
  assert.equal(
    resolveInvoiceCarrierClientSharedKey({
      VITE_BANK_SYNC_CLIENT_SHARED_KEY: 'bank-shared-key',
    }),
    'bank-shared-key',
  )

  assert.equal(
    resolveInvoiceCarrierClientSharedKey({
      VITE_INVOICE_CARRIER_CLIENT_SHARED_KEY: 'invoice-shared-key',
      VITE_BANK_SYNC_CLIENT_SHARED_KEY: 'bank-shared-key',
    }),
    'invoice-shared-key',
  )
})
