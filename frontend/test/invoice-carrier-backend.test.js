import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isInvoiceCarrierLinkingSupportedFor,
  isInvoiceCarrierApiConfiguredFor,
  resolveInvoiceCarrierApiBase,
  resolveInvoiceCarrierClientSharedKey,
  shouldUseSameOriginLocalInvoiceApi,
} from '../src/services/invoice-carrier/backend.js'

test('invoice carrier adapter honors an explicit dedicated api base on native runtime', () => {
  assert.equal(
    resolveInvoiceCarrierApiBase({
      env: {
        VITE_INVOICE_CARRIER_API_BASE_URL: 'https://invoice.example.com',
      },
      platform: 'android',
      windowRef: null,
    }),
    'https://invoice.example.com',
  )

  assert.equal(
    isInvoiceCarrierApiConfiguredFor({
      env: {
        VITE_INVOICE_CARRIER_API_BASE_URL: 'https://invoice.example.com',
      },
      platform: 'android',
      windowRef: null,
    }),
    true,
  )
})

test('invoice carrier adapter no longer piggybacks shared-ledger api base by default', () => {
  assert.equal(
    resolveInvoiceCarrierApiBase({
      env: {
        VITE_SHARED_LEDGER_API_BASE_URL: 'https://api.example.com',
      },
      platform: 'android',
      windowRef: null,
    }),
    'https://api.strawmb.com',
  )
})

test('invoice carrier adapter falls back to the official StrawMB api host on native runtime when invoice api base is omitted', () => {
  assert.equal(
    resolveInvoiceCarrierApiBase({
      env: {},
      platform: 'android',
      windowRef: null,
    }),
    'https://api.strawmb.com',
  )

  assert.equal(
    isInvoiceCarrierApiConfiguredFor({
      env: {},
      platform: 'android',
      windowRef: null,
    }),
    true,
  )
})

test('invoice carrier link flow is blocked on native runtime unless explicitly enabled', () => {
  assert.equal(
    isInvoiceCarrierLinkingSupportedFor({
      env: {},
      platform: 'android',
    }),
    false,
  )

  assert.equal(
    isInvoiceCarrierLinkingSupportedFor({
      env: {
        VITE_INVOICE_CARRIER_ALLOW_NATIVE_LINKING: 'true',
      },
      platform: 'android',
    }),
    true,
  )

  assert.equal(
    isInvoiceCarrierLinkingSupportedFor({
      env: {},
      platform: 'web',
    }),
    true,
  )
})

test('invoice carrier adapter keeps same-origin api routing on localhost web preview', () => {
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

test('invoice carrier adapter uses production api host on custom https web hosts', () => {
  assert.equal(
    shouldUseSameOriginLocalInvoiceApi({
      env: {
        PROD: true,
      },
      platform: 'web',
      windowRef: {
        location: {
          origin: 'https://preview.example.com',
        },
      },
    }),
    false,
  )

  assert.equal(
    resolveInvoiceCarrierApiBase({
      env: {
        PROD: true,
      },
      platform: 'web',
      windowRef: {
        location: {
          origin: 'https://preview.example.com',
        },
      },
    }),
    'https://api.strawmb.com',
  )
})

test('invoice carrier adapter uses production api host on StrawMB web because www is static hosting', () => {
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
    false,
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
    'https://api.strawmb.com',
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
