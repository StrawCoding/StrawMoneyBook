import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  allocateClaimPaymentFifo,
  claimRecordedPaymentMinor,
  claimRemainingMinor,
  isClaimCollecting,
  isClaimDraftEditable,
  isClaimFullyPaid,
} from '../src/core/utils/claim-sheet-payment.js'

test('FIFO allocates this payment only, oldest item first', () => {
  const items = [
    { id: 'b', amount_minor: 10000, settled_minor: 0, created_at: '2026-10-02T00:00:00.000Z' },
    { id: 'a', amount_minor: 8000, settled_minor: 3000, created_at: '2026-10-01T00:00:00.000Z' },
  ]

  const first = allocateClaimPaymentFifo(items, 4000)
  assert.equal(first.allocatedMinor, 4000)
  assert.equal(first.leftoverMinor, 0)
  assert.deepEqual(first.allocations.map((row) => [row.itemId, row.amountMinor]), [['a', 4000]])

  const nextItems = items.map((item) => (
    item.id === 'a' ? { ...item, settled_minor: 7000 } : item
  ))
  const second = allocateClaimPaymentFifo(nextItems, 6000)
  assert.deepEqual(second.allocations.map((row) => [row.itemId, row.amountMinor]), [
    ['a', 1000],
    ['b', 5000],
  ])
})

test('FIFO leftover stays when remaining items cannot cover this payment', () => {
  const result = allocateClaimPaymentFifo([
    { id: 'a', amount_minor: 3000, settled_minor: 1000, created_at: '2026-10-01T00:00:00.000Z' },
  ], 5000)
  assert.equal(result.allocatedMinor, 2000)
  assert.equal(result.leftoverMinor, 3000)
})

test('claim remaining and collecting flags follow paid_minor writeback', () => {
  const collecting = { total_minor: 10000, paid_minor: 4000, status: 'approved' }
  assert.equal(claimRemainingMinor(collecting), 6000)
  assert.equal(isClaimCollecting(collecting), true)
  assert.equal(isClaimFullyPaid(collecting), false)
  assert.equal(isClaimFullyPaid({ total_minor: 10000, paid_minor: 10000, status: 'paid' }), true)
})

test('isClaimDraftEditable allows collecting sheets and blocks only when fully paid', () => {
  assert.equal(isClaimDraftEditable({ status: 'draft', paid_minor: 0, total_minor: 1000 }), true)
  assert.equal(isClaimDraftEditable({ status: 'approved', paid_minor: 0, total_minor: 1000 }), true)
  assert.equal(isClaimDraftEditable({ status: 'submitted', paid_minor: 0, total_minor: 1000 }), true)
  assert.equal(isClaimDraftEditable({ status: 'approved', paid_minor: 400, total_minor: 1000 }), true)
  assert.equal(isClaimDraftEditable({ status: 'paid', paid_minor: 1000, total_minor: 1000 }), false)
  assert.equal(isClaimDraftEditable({ status: 'paid', paid_minor: 0, total_minor: 1000 }), true)
})

test('claimRecordedPaymentMinor prefers paid_minor and sums payment rows when claim is still zero', () => {
  assert.equal(claimRecordedPaymentMinor({ paid_minor: 500 }), 500)
  assert.equal(
    claimRecordedPaymentMinor({ paid_minor: 0 }, [{ amount_minor: 200 }, { amount_minor: 300 }]),
    500,
  )
  assert.equal(
    isClaimDraftEditable({ status: 'approved', paid_minor: 0, total_minor: 1000 }, { payments: [{ amount_minor: 1 }] }),
    true,
  )
  assert.equal(
    isClaimDraftEditable({ status: 'paid', paid_minor: 1000, total_minor: 1000 }, { payments: [{ amount_minor: 1 }] }),
    false,
  )
})

test('schema lists include claim payment tables and settled_minor writeback', () => {
  const root = resolve(import.meta.dirname, '..')
  const files = {
    migrate: readFileSync(resolve(root, 'src/core/db/migrate.js'), 'utf8'),
    migration: readFileSync(resolve(root, 'src/core/db/migrations/050_claim_sheet_payments.sql'), 'utf8'),
    deleteOrder: readFileSync(resolve(root, 'src/core/utils/sqlite-delete-order.js'), 'utf8'),
    exportService: readFileSync(resolve(root, 'src/core/services/export.service.js'), 'utf8'),
    schema: readFileSync(resolve(root, 'src/core/services/backup-json-import-schema.js'), 'utf8'),
    snapshot: readFileSync(resolve(root, 'src/ui/services/shared-ledger/snapshot-merge.js'), 'utf8'),
    service: readFileSync(resolve(root, 'src/core/services/reimbursement.service.js'), 'utf8'),
    listPage: readFileSync(resolve(root, 'src/ui/views/claims/ClaimSheetListPage.vue'), 'utf8'),
    detailPage: readFileSync(resolve(root, 'src/ui/views/claims/ClaimSheetDetailPage.vue'), 'utf8'),
    paymentSheet: readFileSync(resolve(root, 'src/ui/components/claims/ClaimSheetRecordPaymentSheet.vue'), 'utf8'),
  }

  assert.match(files.migrate, /version: 50, name: 'claim_sheet_payments'/)
  assert.match(files.migration, /CREATE TABLE IF NOT EXISTS reimbursement_payments/)
  assert.match(files.migration, /CREATE TABLE IF NOT EXISTS reimbursement_payment_allocations/)
  assert.match(files.deleteOrder, /'reimbursement_payment_allocations'/)
  assert.match(files.deleteOrder, /'reimbursement_payments'/)
  assert.match(files.exportService, /'reimbursement_payments'/)
  assert.match(files.schema, /reimbursement_payments:/)
  assert.match(files.schema, /settled_minor/)
  assert.match(files.schema, /paid_minor/)
  assert.match(files.snapshot, /'reimbursement_payments'/)
  assert.match(files.snapshot, /'reimbursement_payment_allocations'/)
  assert.match(files.service, /allocateClaimPaymentFifo\(claimItems, requestedMinor\)/)
  assert.match(files.service, /export async function ensureClaimReadyForPayment/)
  assert.match(files.service, /claim = await ensureClaimReadyForPayment\(ledgerId, claim\)/)
  assert.match(files.service, /await addReimbursementItemSettledMinor/)
  assert.match(files.service, /claimRecordedPaymentMinor\(claim, payments\)/)
  assert.match(files.service, /revertPaidClaimEffects\(ledgerId, claim, claimItems\)/)
  assert.match(files.service, /const revertingPaymentsToDraft =/)
  assert.match(files.service, /if \(revertingPaymentsToDraft\) \{[\s\S]*return updateReimbursementStatus/)
  assert.doesNotMatch(files.service, /assertCanTransition\(claim\.status, nextStatus\)[\s\S]*revertingPaymentsToDraft/)
  assert.match(files.detailPage, /isClaimDraftEditable\(value, \{ payments: payments\.value \}\)/)
  assert.doesNotMatch(files.listPage, /async function ensureClaimReadyForPayment/)
  assert.match(files.listPage, /openRecordPaymentOnDetail/)
  assert.match(files.paymentSheet, /data-testid="claim-payment-amount"/)
  assert.match(files.paymentSheet, /amountMinor: completePaymentMinor\.value/)
  assert.match(files.detailPage, /t\('claim_sheet\.payments_title'\)/)
  assert.match(files.detailPage, /t\('claim_sheet\.record_payment'\)/)
  assert.match(files.detailPage, /ClaimSheetRecordPaymentSheet/)
})
