import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register('./helpers/alias-loader.mjs', import.meta.url)

const {
  claimSheetImportedMaxAmountMinor,
  resolveClaimSheetImportedAmountMinor,
  resolveImportedTxAmountMinor,
  buildClaimSheetImportedClaimItem,
} = await import('../src/ui/utils/claim-sheet-import.js')

const {
  buildImportAmountOverrideMapFromClaimItems,
  clampImportAmountOverridesForTxs,
  seedImportAmountOverrides,
} = await import('../src/ui/utils/claim-sheet-import-amount-overrides.js')

const { shouldSyncDraftClaimItem } = await import('../src/core/utils/claim-sheet-draft-sync.js')

test('resolveClaimSheetImportedAmountMinor caps custom amount at available max', () => {
  const tx = { id: 'tx_1', is_reimbursable: 1, amount_minor: -10000, reimbursed_minor: 0 }
  assert.equal(claimSheetImportedMaxAmountMinor(tx), 10000)
  assert.equal(resolveClaimSheetImportedAmountMinor(tx, 6000), 6000)
  assert.equal(resolveClaimSheetImportedAmountMinor(tx, 12000), 10000)
  assert.equal(resolveClaimSheetImportedAmountMinor(tx, null), 10000)
})

test('resolveImportedTxAmountMinor reads major-unit override map', () => {
  const tx = { id: 'tx_1', is_reimbursable: 1, amount_minor: -10000, reimbursed_minor: 0 }
  assert.equal(resolveImportedTxAmountMinor(tx, { tx_1: 45 }), 4500)
  assert.equal(resolveImportedTxAmountMinor(tx, {}), 10000)
})

test('buildClaimSheetImportedClaimItem honours explicit amountMinor option', () => {
  const tx = { id: 'tx_1', is_reimbursable: 1, amount_minor: -10000, reimbursed_minor: 0 }
  const item = buildClaimSheetImportedClaimItem(tx, (key) => key, { amountMinor: 2500 })
  assert.equal(item.amountMinor, 2500)
})

test('buildImportAmountOverrideMapFromClaimItems maps saved claim item amounts', () => {
  const map = buildImportAmountOverrideMapFromClaimItems([
    { transaction_id: 'tx_a', entry_type: 'expense', amount_minor: 4500 },
    { transaction_id: 'tx_b', entry_type: 'income', amount_minor: 2000 },
  ], 'reimbursement')
  assert.deepEqual(map, { tx_a: 45 })
})

test('seedImportAmountOverrides defaults missing ids to full available amount', () => {
  const tx = { id: 'tx_1', is_reimbursable: 1, amount_minor: -8000, reimbursed_minor: 0 }
  const seeded = seedImportAmountOverrides([tx], {})
  assert.equal(seeded.tx_1, 80)
})

test('clampImportAmountOverridesForTxs caps overrides when pending shrinks', () => {
  const tx = { id: 'tx_1', is_reimbursable: 1, amount_minor: -10000, reimbursed_minor: 3000 }
  const clamped = clampImportAmountOverridesForTxs({ tx_1: 90 }, [tx])
  assert.equal(clamped.tx_1, 70)
})

test('draft sync keeps partial claim amount when pending is still above it', () => {
  const item = {
    id: 'item_1',
    reimbursement_id: 'claim_1',
    transaction_id: 'tx_1',
    source_type: 'transaction',
    entry_type: 'expense',
    description: '未命名報銷',
    amount_minor: 5000,
  }
  const tx = {
    id: 'tx_1',
    is_reimbursable: 1,
    amount_minor: -10000,
    reimbursed_minor: 0,
  }
  const decision = shouldSyncDraftClaimItem(item, tx)
  assert.equal(decision.shouldUpdate, false)
})

test('draft sync caps partial claim amount when pending drops below it', () => {
  const item = {
    id: 'item_1',
    reimbursement_id: 'claim_1',
    transaction_id: 'tx_1',
    source_type: 'transaction',
    entry_type: 'expense',
    description: '交通費',
    amount_minor: 8000,
  }
  const tx = {
    id: 'tx_1',
    is_reimbursable: 1,
    amount_minor: -10000,
    reimbursed_minor: 5000,
  }
  const decision = shouldSyncDraftClaimItem(item, tx)
  assert.equal(decision.shouldUpdate, true)
  assert.equal(decision.sync.amountMinor, 5000)
})
