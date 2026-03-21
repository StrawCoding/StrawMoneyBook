import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDefaultEinvoiceSyncFilter,
  createEinvoiceInvoiceSourceKey,
  normalizeEinvoiceCarrierOptions,
  normalizeEinvoiceInvoiceRows,
  normalizeEinvoiceSyncFilter,
} from '../src/services/einvoice-carrier/shared.js'

test('buildDefaultEinvoiceSyncFilter uses first day of month through today', () => {
  const filter = buildDefaultEinvoiceSyncFilter(new Date('2026-03-20T08:00:00.000Z'))
  assert.deepEqual(filter, {
    dateFrom: '2026-03-01',
    dateTo: '2026-03-20',
    carrier: 'all',
    status: 'all',
    buyerBan: '',
    productName: '',
  })
})

test('normalizeEinvoiceSyncFilter normalizes dates and swaps reversed ranges', () => {
  const filter = normalizeEinvoiceSyncFilter({
    dateFrom: '2026-03-20',
    dateTo: '2026-03-01',
    carrier: ' 0 ',
    status: ' 1 ',
    buyerBan: ' 12345678 ',
    productName: ' 咖啡 ',
  })
  assert.deepEqual(filter, {
    dateFrom: '2026-03-01',
    dateTo: '2026-03-20',
    carrier: '0',
    status: '1',
    buyerBan: '12345678',
    productName: '咖啡',
  })
})

test('normalizeEinvoiceCarrierOptions keeps usable value label pairs', () => {
  assert.deepEqual(normalizeEinvoiceCarrierOptions([
    { value: 'all', label: '全部載具' },
    { value: '0', label: '手機條碼' },
    { value: '', label: '' },
  ]), [
    { value: 'all', label: '全部載具' },
    { value: '0', label: '手機條碼' },
  ])
})

test('normalizeEinvoiceInvoiceRows builds stable provider keys', () => {
  const rows = normalizeEinvoiceInvoiceRows([
    {
      invoiceNumber: 'AB12345678',
      invoiceDate: '2026-03-20',
      amountMinor: 27000,
      sellerName: '測試商店',
      carrierLabel: '手機條碼',
      invoiceStatus: '0',
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].providerInvoiceKey, createEinvoiceInvoiceSourceKey({
    invoiceNumber: 'AB12345678',
    invoiceDate: '2026-03-20',
    amountMinor: 27000,
    sellerName: '測試商店',
    carrierLabel: '手機條碼',
  }))
})
