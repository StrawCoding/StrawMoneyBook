import test from 'node:test'
import assert from 'node:assert/strict'
import {
  collectInvoiceCandidates,
  extractInvoicesFromJsonPayloads,
  mergeQueryWindows,
  splitQueryDateRange,
  splitQueryDateRangeByMonth,
} from '../src/einvoice/portal-json.js'

test('extractInvoicesFromJsonPayloads finds nested portal JSON rows', () => {
  const payloads = [{
    data: {
      list: [
        { invNum: 'AB12345678', invAmount: 120, invDate: '2026/06/01', sellerName: 'Mock' },
        { foo: 'bar' },
      ],
    },
  }]
  const invoices = extractInvoicesFromJsonPayloads(payloads)
  assert.equal(invoices.length, 1)
  assert.equal(invoices[0].invoiceNumber, 'AB12345678')
  assert.equal(invoices[0].amount, 120)
})

test('splitQueryDateRange respects max day window', () => {
  const windows = splitQueryDateRange('2026-01-01', '2026-03-05', 62)
  assert.equal(windows.length, 2)
  assert.deepEqual(windows[0], { startDate: '2026-01-01', endDate: '2026-03-03' })
  assert.deepEqual(windows[1], { startDate: '2026-03-04', endDate: '2026-03-05' })
})

test('splitQueryDateRangeByMonth splits at calendar month boundaries', () => {
  const windows = splitQueryDateRangeByMonth('2026-05-20', '2026-06-10')
  assert.equal(windows.length, 2)
  assert.deepEqual(windows[0], { startDate: '2026-05-20', endDate: '2026-05-31' })
  assert.deepEqual(windows[1], { startDate: '2026-06-01', endDate: '2026-06-10' })
})

test('mergeQueryWindows combines month and max-day splitting', () => {
  const windows = mergeQueryWindows('2026-05-20', '2026-07-10', 62)
  assert.ok(windows.length >= 3)
  assert.equal(windows[0].startDate, '2026-05-20')
  assert.equal(windows.at(-1).endDate, '2026-07-10')
})

test('collectInvoiceCandidates ignores invalid invoice numbers', () => {
  const invoices = collectInvoiceCandidates({
    rows: [{ invNum: 'INVALID' }, { invNum: 'ZZ98765432', invAmount: 9 }],
  })
  assert.equal(invoices.length, 1)
  assert.equal(invoices[0].invoiceNumber, 'ZZ98765432')
})
