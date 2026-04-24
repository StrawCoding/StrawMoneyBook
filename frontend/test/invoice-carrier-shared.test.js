import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildInvoiceCarrierCredentialSettingKey,
  formatInvoiceCarrierErrorForStorage,
  isInvoiceCarrierReauthError,
  normalizeCarrierOptions,
  parseInvoiceDateText,
  normalizeInvoiceCarrierCredentialState,
} from '../src/services/invoice-carrier/shared.js'
import { isLocalOnlyAppSettingKey } from '../src/ui/services/local-only-app-settings.js'

test('parseInvoiceDateText normalizes zh-TW invoice dates to ISO format', () => {
  assert.equal(parseInvoiceDateText('2026年3月9日'), '2026-03-09')
  assert.equal(parseInvoiceDateText('2026-03-19'), '2026-03-19')
  assert.equal(parseInvoiceDateText(''), '')
})

test('normalizeCarrierOptions deduplicates and removes empty options', () => {
  assert.deepEqual(normalizeCarrierOptions([
    { value: '/ABC1234', label: '手機條碼' },
    { value: '/ABC1234', label: '手機條碼' },
    { value: '', label: '空值' },
  ]), [{ value: '/ABC1234', label: '手機條碼' }])
})

test('normalizeInvoiceCarrierCredentialState preserves Android native storage markers', () => {
  const result = normalizeInvoiceCarrierCredentialState({
    provider: 'einvoice_tw',
    mobilePhone: '0912345678',
    password: 'pw',
    storageState: {
      native: true,
      provider: 'einvoice_tw',
      connectionId: 'native-conn',
      cookies: [],
      origins: [],
      ignored: 'value',
    },
  })

  assert.deepEqual(result.storageState, {
    native: true,
    provider: 'einvoice_tw',
    connectionId: 'native-conn',
    cookies: [],
    origins: [],
  })
})

test('invoice carrier shared helpers mark reauth errors and format local-only keys', () => {
  const error = new Error('電子發票網站要求重新完成 Cloudflare 安全驗證')
  error.code = 'invoice_carrier_automation_blocked'

  assert.equal(buildInvoiceCarrierCredentialSettingKey('conn-1'), 'invoice_carrier.credentials.conn-1')
  assert.equal(formatInvoiceCarrierErrorForStorage(error), 'invoice_carrier_automation_blocked: 電子發票網站要求重新完成 Cloudflare 安全驗證')
  assert.equal(isInvoiceCarrierReauthError(error), false)
})

test('local-only app setting filter excludes invoice and bank credentials from sync snapshots', () => {
  assert.equal(isLocalOnlyAppSettingKey('invoice_carrier.credentials.conn-1'), true)
  assert.equal(isLocalOnlyAppSettingKey('bank_sync.credentials.conn-1'), true)
  assert.equal(isLocalOnlyAppSettingKey('backup.google_drive.state'), true)
  assert.equal(isLocalOnlyAppSettingKey('sync.scheduler.state'), true)
  assert.equal(isLocalOnlyAppSettingKey('shared_ledger_meta'), true)
  assert.equal(isLocalOnlyAppSettingKey('theme.primary_color'), false)
})
