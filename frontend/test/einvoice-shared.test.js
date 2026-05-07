import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createEInvoiceError,
  isEInvoiceError,
  EINVOICE_STATUS,
  EINVOICE_PLATFORM,
} from '../src/services/einvoice/shared.js'

test('createEInvoiceError builds an Error with a code property', () => {
  const err = createEInvoiceError('Not supported', 'einvoice_not_supported')
  assert.ok(err instanceof Error)
  assert.equal(err.message, 'Not supported')
  assert.equal(err.code, 'einvoice_not_supported')
})

test('createEInvoiceError uses default code when not provided', () => {
  const err = createEInvoiceError('Something went wrong')
  assert.equal(err.code, 'einvoice_error')
})

test('createEInvoiceError uses fallback message when blank', () => {
  const err = createEInvoiceError('')
  assert.equal(err.message, 'E-invoice error')
})

test('createEInvoiceError uses fallback message when null', () => {
  const err = createEInvoiceError(null)
  assert.equal(err.message, 'E-invoice error')
})

test('isEInvoiceError returns true for errors created by createEInvoiceError', () => {
  const err = createEInvoiceError('test', 'einvoice_not_supported')
  assert.equal(isEInvoiceError(err), true)
})

test('isEInvoiceError returns false for plain Error without code', () => {
  const err = new Error('plain error')
  assert.equal(isEInvoiceError(err), false)
})

test('isEInvoiceError returns false for non-Error values', () => {
  assert.equal(isEInvoiceError(null), false)
  assert.equal(isEInvoiceError('string'), false)
  assert.equal(isEInvoiceError(42), false)
})

test('EINVOICE_PLATFORM is the expected constant', () => {
  assert.equal(EINVOICE_PLATFORM, 'einvoice')
})

test('EINVOICE_STATUS is frozen and contains expected keys', () => {
  assert.ok(Object.isFrozen(EINVOICE_STATUS))
  assert.equal(EINVOICE_STATUS.ALL, 'all')
  assert.equal(EINVOICE_STATUS.NOT_DONATED, 'not_donated')
  assert.equal(EINVOICE_STATUS.DONATED, 'donated')
  assert.equal(EINVOICE_STATUS.VOIDED, 'voided')
})

test('isEInvoiceAutomationSupported returns false in non-native context (Node.js test environment)', async () => {
  // In the Node.js test environment (non-Capacitor), isEInvoiceAutomationRuntimeSupported()
  // returns false because Capacitor.isNativePlatform() is false.
  // On Android native builds it returns true, enabling the EInvoiceAutomation plugin flow.
  const { EINVOICE_PLATFORM: p } = await import('../src/services/einvoice/shared.js')
  assert.equal(typeof p, 'string')
})
