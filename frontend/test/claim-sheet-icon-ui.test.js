import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const claimPresentationSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/utils/claim-sheet-presentation.js'),
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

const claimDetailSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetDetailPage.vue'),
  'utf8',
)

test('claim sheet shared presentation helper defines a dedicated advance icon and item presenters', () => {
  assert.match(claimPresentationSource, /export const CLAIM_ADVANCE_ICON = 'fa-solid fa-hand-holding-dollar'/)
  assert.match(claimPresentationSource, /export function presentClaimDetailItem\(item, categoryLookup, t\)/)
  assert.match(claimPresentationSource, /export function presentClaimManualFormItem\(item, categoryLookup, t\)/)
  assert.match(claimPresentationSource, /export function presentImportedClaimTx\(tx, categoryLookup, t\)/)
  assert.match(claimPresentationSource, /icon: isAdvance \? CLAIM_ADVANCE_ICON/)
})

test('claim sheet detail page renders icon-aware item headers and meta badges', () => {
  assert.match(claimDetailSource, /presentClaimDetailItem/)
  assert.match(claimDetailSource, /v-if="itemPresentation\(item\)\.icon"/)
  assert.match(claimDetailSource, /:icon="itemPresentation\(item\)\.icon"/)
  assert.match(claimDetailSource, /class="detail-badge muted"/)
  assert.match(claimDetailSource, /itemPresentation\(item\)\.categoryName \|\| t\('analysis_page\.uncategorized'\)/)
})

test('claim sheet create and edit forms show icon-enhanced manual rows and import page shows imported rows', () => {
  assert.match(claimListSource, /presentClaimManualFormItem/)
  assert.match(claimListSource, /class="manual-item-preview"/)
  assert.match(claimListSource, /v-if="manualItemPresentation\(item\)\.icon"/)
  assert.match(claimEditSource, /presentClaimManualFormItem/)
  assert.match(claimEditSource, /class="manual-item-preview"/)
  assert.match(claimEditSource, /v-if="manualItemPresentation\(item\)\.icon"/)
  assert.match(claimImportSource, /presentImportedClaimTx/)
  assert.match(claimImportSource, /v-if="importedTxPresentation\(tx\)\.icon"/)
})

test('claim sheet list cards keep detail navigation and completion affordance after the UI refresh', () => {
  assert.match(claimListSource, /router\.push\(\{\s+name: 'claim-sheet-detail',[\s\S]*params: \{ id: claim\.id \}/)
  assert.match(claimListSource, /class="btn primary claim-complete-btn"/)
  assert.match(claimListSource, /t\('transaction_about\.detail\.updated_at'\)/)
})
