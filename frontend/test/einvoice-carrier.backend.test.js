import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveEinvoiceApiBaseForRuntime,
  shouldRequireExplicitEinvoiceApiBaseForRuntime,
} from '../src/services/einvoice-carrier/backend.js'

test('native production runtime falls back to hosted e-invoice API base', () => {
  assert.equal(
    resolveEinvoiceApiBaseForRuntime({
      explicitBase: '',
      platform: 'android',
      isProd: true,
    }),
    'https://www.strawmb.com',
  )
  assert.equal(
    shouldRequireExplicitEinvoiceApiBaseForRuntime({
      explicitBase: '',
      platform: 'android',
      isProd: true,
    }),
    false,
  )
})

test('web runtime keeps same-origin API routing without forcing explicit base', () => {
  assert.equal(
    resolveEinvoiceApiBaseForRuntime({
      explicitBase: '',
      platform: 'web',
      isProd: true,
    }),
    '',
  )
  assert.equal(
    shouldRequireExplicitEinvoiceApiBaseForRuntime({
      explicitBase: '',
      platform: 'web',
      isProd: true,
    }),
    false,
  )
})

test('native development runtime also falls back to hosted e-invoice API base', () => {
  assert.equal(
    resolveEinvoiceApiBaseForRuntime({
      explicitBase: '',
      platform: 'android',
      isProd: false,
    }),
    'https://www.strawmb.com',
  )
  assert.equal(
    shouldRequireExplicitEinvoiceApiBaseForRuntime({
      explicitBase: '',
      platform: 'android',
      isProd: false,
    }),
    false,
  )
})
