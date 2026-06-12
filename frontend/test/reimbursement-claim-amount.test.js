import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register('./helpers/alias-loader.mjs', import.meta.url)

const {
  reimbursementClaimableMinor,
  reimbursementPendingMinor,
  reimbursementReimbursedMinor,
  withReimbursementDerivedFields,
} = await import('../src/ui/utils/reimbursement-item.js')

const { claimSheetImportedAmountMinor, buildClaimSheetImportedClaimItem } = await import(
  '../src/ui/utils/claim-sheet-import.js'
)

test('claimable amount falls back to the original expense when no target is set', () => {
  const tx = { is_reimbursable: 1, amount_minor: -12000 }
  assert.equal(reimbursementClaimableMinor(tx), 12000)
})

test('claimable amount honours the configured reimburse target', () => {
  const tx = { is_reimbursable: 1, amount_minor: -12000, reimburse_target_minor: 8000 }
  assert.equal(reimbursementClaimableMinor(tx), 8000)
  assert.equal(reimbursementPendingMinor(tx), 8000)
})

test('a zero target means nothing is claimable', () => {
  const tx = { is_reimbursable: 1, amount_minor: -12000, reimburse_target_minor: 0 }
  assert.equal(reimbursementClaimableMinor(tx), 0)
  assert.equal(reimbursementPendingMinor(tx), 0)
})

test('invalid / negative targets fall back to the original expense', () => {
  assert.equal(
    reimbursementClaimableMinor({ is_reimbursable: 1, amount_minor: -5000, reimburse_target_minor: -1 }),
    5000,
  )
  assert.equal(
    reimbursementClaimableMinor({ is_reimbursable: 1, amount_minor: -5000, reimburse_target_minor: 'abc' }),
    5000,
  )
})

test('non-reimbursable transactions ignore the target column', () => {
  const tx = { is_reimbursable: 0, amount_minor: -5000, reimburse_target_minor: 100 }
  assert.equal(reimbursementClaimableMinor(tx), 5000)
})

test('pending amount subtracts already reimbursed money from the target', () => {
  const tx = { is_reimbursable: 1, amount_minor: -12000, reimburse_target_minor: 8000, reimbursed_minor: 3000 }
  assert.equal(reimbursementReimbursedMinor(tx), 3000)
  assert.equal(reimbursementPendingMinor(tx), 5000)
})

test('reimbursed amount is capped at the configured target', () => {
  const tx = { is_reimbursable: 1, amount_minor: -12000, reimburse_target_minor: 8000, reimbursed_minor: 9999 }
  assert.equal(reimbursementReimbursedMinor(tx), 8000)
  assert.equal(reimbursementPendingMinor(tx), 0)
})

test('claim sheet import uses the configured reimburse target as the item amount', () => {
  const tx = { id: 'tx_1', is_reimbursable: 1, amount_minor: -12000, reimburse_target_minor: 8000 }
  assert.equal(claimSheetImportedAmountMinor(tx), 8000)
  const item = buildClaimSheetImportedClaimItem(tx, (key) => key)
  assert.equal(item.amountMinor, 8000)
})

test('derived fields expose the claimable amount and target-based pending', () => {
  const derived = withReimbursementDerivedFields({
    is_reimbursable: 1,
    amount_minor: -12000,
    reimburse_target_minor: 8000,
    reimbursed_minor: 2000,
  })
  assert.equal(derived.original_amount_minor, 12000)
  assert.equal(derived.claimable_amount_minor, 8000)
  assert.equal(derived.pending_amount_minor, 6000)
})
