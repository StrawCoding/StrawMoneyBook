import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const routerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/router/index.js'),
  'utf8',
)

const claimListSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetListPage.vue'),
  'utf8',
)

const claimEditSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetEditPage.vue'),
  'utf8',
)

const claimImportSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetImportPage.vue'),
  'utf8',
)

const draftSessionSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/claim-sheet-import-draft-session.js'),
  'utf8',
)

test('claim sheets expose a dedicated reimbursement import route and page', () => {
  assert.match(routerSource, /name: 'claim-sheet-import'/)
  assert.match(routerSource, /path: '\/claim-sheets\/:id\/import-reimbursements'/)
  assert.match(claimImportSource, /reimbursementStore\.pendingItems/)
  assert.match(claimImportSource, /selectedImportedDraftItems/)
  assert.match(claimImportSource, /updateReimbursementDraft/)
})

test('claim reimbursement import page supports select all and clear all', () => {
  assert.match(claimImportSource, /const allImportableSelected = computed/)
  assert.match(claimImportSource, /function toggleSelectAll\(\)/)
  assert.match(claimImportSource, /claim_sheet\.import\.select_all/)
  assert.match(claimImportSource, /claim_sheet\.import\.clear_all/)
})

test('claim forms use an import button instead of inline reimbursement checkboxes', () => {
  assert.match(claimListSource, /openImportPageFromCreateSheet/)
  assert.match(claimEditSource, /openImportPage/)
  assert.match(claimListSource, /claim_sheet\.import\.open/)
  assert.match(claimEditSource, /claim_sheet\.import\.open/)
  assert.doesNotMatch(claimListSource, /v-for="tx in reimbursementStore\.pendingItems"[\s\S]*v-model="createForm\.importTxIds"/)
  assert.doesNotMatch(claimEditSource, /v-for="tx in editableImportedTxs"[\s\S]*v-model="form\.importTxIds"/)
})

test('new claim import flow preserves draft form state while visiting the import page', () => {
  assert.match(draftSessionSource, /sessionStorage/)
  assert.match(claimListSource, /saveClaimSheetDraftSession/)
  assert.match(claimListSource, /loadClaimSheetDraftSession/)
  assert.match(claimImportSource, /claimId\.value === 'new'/)
  assert.match(claimImportSource, /saveClaimSheetDraftSession\(\{[\s\S]*importTxIds: selectedTxIds\.value/)
})
