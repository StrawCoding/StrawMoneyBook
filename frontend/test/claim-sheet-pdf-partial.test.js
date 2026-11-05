import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { detailHasPartialSettlement } from '../src/core/services/claim-sheet-pdf.service.js'

test('detailHasPartialSettlement detects collecting claim sheets and settled items', () => {
  assert.equal(
    detailHasPartialSettlement({ status: 'approved', total_minor: 100000, paid_minor: 40000 }, []),
    true,
  )
  assert.equal(
    detailHasPartialSettlement({ status: 'draft', total_minor: 50000, paid_minor: 0 }, [
      { amount_minor: 50000, settled_minor: 10000 },
    ]),
    true,
  )
  assert.equal(
    detailHasPartialSettlement({ status: 'paid', total_minor: 50000, paid_minor: 50000 }, []),
    false,
  )
})

test('claim sheet pdf service includes partial payment layout and payment history', () => {
  const pdfServiceSource = readFileSync(
    resolve(import.meta.dirname, '../src/core/services/claim-sheet-pdf.service.js'),
    'utf8',
  )
  const detailSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetDetailPage.vue'),
    'utf8',
  )

  assert.match(pdfServiceSource, /function createPaymentSummaryMarkup/)
  assert.match(pdfServiceSource, /function createPaymentsHistoryMarkup/)
  assert.match(pdfServiceSource, /items-table--partial/)
  assert.match(pdfServiceSource, /itemSettledLabel/)
  assert.match(detailSource, /payments: payments\.value/)
  assert.match(detailSource, /claimStatusLabel\(claim\.value\)/)
})
