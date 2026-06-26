import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { register } from 'node:module'

register('./helpers/alias-loader.mjs', import.meta.url)

const {
  buildReimbursementImportTitle,
  isReimbursementImportClaimItem,
  reconcileDraftClaimItemRows,
  resolveReimbursementImportSync,
  shouldSyncDraftClaimItem,
} = await import('../src/core/utils/claim-sheet-draft-sync.js')

const reimbursementServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/reimbursement.service.js'),
  'utf8',
)

const draftSyncServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/claim-sheet-draft-sync.service.js'),
  'utf8',
)

const transactionServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/transaction.service.js'),
  'utf8',
)

const reimbursementRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/reimbursement.repo.js'),
  'utf8',
)

test('reimbursement import claim items are transaction expense rows only', () => {
  assert.equal(isReimbursementImportClaimItem({ source_type: 'transaction', entry_type: 'expense' }), true)
  assert.equal(isReimbursementImportClaimItem({ source_type: 'transaction', entry_type: 'income' }), false)
  assert.equal(isReimbursementImportClaimItem({ source_type: 'manual', entry_type: 'expense' }), false)
})

test('resolveReimbursementImportSync updates amount from reimburse target pending', () => {
  const tx = {
    is_reimbursable: 1,
    amount_minor: -12000,
    reimburse_target_minor: 8000,
    reimbursed_minor: 0,
    category_name: '交通費',
  }
  assert.deepEqual(resolveReimbursementImportSync(tx), {
    action: 'update',
    amountMinor: 8000,
    description: '交通費',
  })
})

test('resolveReimbursementImportSync removes items when pending becomes zero', () => {
  const tx = {
    is_reimbursable: 1,
    amount_minor: -12000,
    reimburse_target_minor: 0,
    reimbursed_minor: 0,
  }
  assert.deepEqual(resolveReimbursementImportSync(tx), {
    action: 'remove',
    reason: 'no_pending_amount',
  })
})

test('resolveReimbursementImportSync removes missing or non-reimbursable transactions', () => {
  assert.deepEqual(resolveReimbursementImportSync(null), {
    action: 'remove',
    reason: 'missing_transaction',
  })
  assert.deepEqual(resolveReimbursementImportSync({ is_reimbursable: 0, amount_minor: -5000 }), {
    action: 'remove',
    reason: 'not_reimbursable',
  })
})

test('resolveReimbursementImportSync removes fully reimbursed transactions', () => {
  const tx = {
    is_reimbursable: 1,
    amount_minor: -12000,
    reimburse_target_minor: 8000,
    reimbursed_minor: 8000,
  }
  assert.deepEqual(resolveReimbursementImportSync(tx), {
    action: 'remove',
    reason: 'no_pending_amount',
  })
})

test('shouldSyncDraftClaimItem only updates when amount or description changed', () => {
  const tx = {
    is_reimbursable: 1,
    amount_minor: -12000,
    reimburse_target_minor: 7000,
    reimbursed_minor: 0,
    category_name: '餐飲',
  }
  const unchanged = shouldSyncDraftClaimItem(
    { source_type: 'transaction', entry_type: 'expense', amount_minor: 7000, description: '餐飲' },
    tx,
  )
  assert.equal(unchanged.shouldRemove, false)
  assert.equal(unchanged.shouldUpdate, false)

  const changed = shouldSyncDraftClaimItem(
    { source_type: 'transaction', entry_type: 'expense', amount_minor: 8000, description: '餐飲' },
    tx,
  )
  assert.equal(changed.shouldRemove, false)
  assert.equal(changed.shouldUpdate, true)
  assert.equal(changed.sync.amountMinor, 7000)
})

test('buildReimbursementImportTitle prefers category name then note', () => {
  assert.equal(buildReimbursementImportTitle({ category_name: '住宿' }), '住宿')
  assert.equal(buildReimbursementImportTitle({ note: '2026-06 出差' }), '2026-06 出差')
  assert.equal(buildReimbursementImportTitle({}), '未命名報銷')
})

test('reconcileDraftClaimItemRows updates draft import item when reimburse target changes', () => {
  const draftItems = [{
    id: 'ri_1',
    reimbursement_id: 'reim_draft_1',
    source_type: 'transaction',
    entry_type: 'expense',
    transaction_id: 'tx_1',
    amount_minor: 12000,
    description: '交通費',
  }]
  const txById = {
    tx_1: {
      is_reimbursable: 1,
      amount_minor: -12000,
      reimburse_target_minor: 8000,
      reimbursed_minor: 0,
      category_name: '交通費',
    },
  }

  const result = reconcileDraftClaimItemRows(draftItems, txById)

  assert.deepEqual(result.updatedRows, [{
    itemId: 'ri_1',
    reimbursementId: 'reim_draft_1',
    description: '交通費',
    amountMinor: 8000,
  }])
  assert.deepEqual(result.removedItemIds, [])
  assert.deepEqual(result.affectedReimbursementIds, ['reim_draft_1'])
})

test('reconcileDraftClaimItemRows removes import items when source tx is deleted or pending is zero', () => {
  const draftItems = [
    {
      id: 'ri_deleted',
      reimbursement_id: 'reim_draft_1',
      source_type: 'transaction',
      entry_type: 'expense',
      transaction_id: 'tx_deleted',
      amount_minor: 5000,
      description: '餐飲',
    },
    {
      id: 'ri_zero',
      reimbursement_id: 'reim_draft_1',
      source_type: 'transaction',
      entry_type: 'expense',
      transaction_id: 'tx_zero',
      amount_minor: 3000,
      description: '雜費',
    },
  ]

  const result = reconcileDraftClaimItemRows(draftItems, {
    tx_zero: {
      is_reimbursable: 1,
      amount_minor: -3000,
      reimburse_target_minor: 0,
      reimbursed_minor: 0,
    },
  })

  assert.deepEqual(result.removedItemIds, ['ri_deleted', 'ri_zero'])
  assert.deepEqual(result.updatedRows, [])
})

test('reconcileDraftClaimItemRows leaves paid claim sheets untouched by only targeting draft rows upstream', () => {
  assert.match(reimbursementRepoSource, /AND r\.status = 'draft'/)
})

test('setReimbursableExpenseClaimAmount triggers draft claim sheet sync', () => {
  assert.match(reimbursementServiceSource, /syncDraftClaimSheetsForTransaction/)
  assert.match(reimbursementServiceSource, /await syncDraftClaimSheetsForTransaction\(ledgerId, txId\)/)
})

test('settle and cancel reimbursement settlement trigger draft claim sheet sync', () => {
  assert.match(reimbursementServiceSource, /await syncDraftClaimSheetsForTransaction\(ledgerId, payload\.txId\)/)
  assert.match(reimbursementServiceSource, /await syncDraftClaimSheetsForTransaction\(ledgerId, txId\)/)
})

test('getReimbursementDetail lazily reconciles draft reimbursement import items', () => {
  assert.match(reimbursementServiceSource, /if \(String\(claim\.status \?\? 'draft'\) === 'draft'\)/)
  assert.match(reimbursementServiceSource, /await reconcileDraftClaimSheetImportItems\(ledgerId, \{ txIds \}\)/)
  assert.match(draftSyncServiceSource, /export async function reconcileDraftClaimSheetImportItems/)
  assert.match(draftSyncServiceSource, /reconcileDraftClaimItemRows/)
})

test('transaction delete and unreimbursable edits trigger draft claim sheet sync', () => {
  assert.match(transactionServiceSource, /reconcileDraftClaimSheetImportItems/)
  assert.match(transactionServiceSource, /await reconcileDraftClaimSheetImportItems\(ledgerId, \{ txIds: cascadeDeleteIds \}\)/)
  assert.match(transactionServiceSource, /!isReimbursable && Boolean\(Number\(currentTx\?\.is_reimbursable \?\? 0\)\)/)
})
