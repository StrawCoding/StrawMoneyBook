import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sheetSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/common/InputBottomSheet.vue'),
  'utf8',
)
const globalCss = readFileSync(
  resolve(import.meta.dirname, '../src/ui/assets/css/global.css'),
  'utf8',
)
const habitatCss = readFileSync(
  resolve(import.meta.dirname, '../src/ui/assets/css/habitat-ui.css'),
  'utf8',
)
const claimListSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetListPage.vue'),
  'utf8',
)
const draftFormSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/claims/ClaimSheetDraftForm.vue'),
  'utf8',
)
const customSelectSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/common/CustomSelect.vue'),
  'utf8',
)

test('InputBottomSheet exposes handle, size tiers, nested mask, and sticky footer hook', () => {
  assert.match(sheetSource, /app-overlay-sheet-handle/)
  assert.match(sheetSource, /app-overlay-sheet-footer/)
  assert.match(sheetSource, /app-overlay-sheet-mask-nested/)
  assert.match(sheetSource, /data-sheet-size/)
  assert.match(globalCss, /\.app-overlay-sheet-size-form/)
  assert.match(globalCss, /\.app-overlay-sheet-footer/)
})

test('modern habitat styles flatten overlay sheets and claim draft lists', () => {
  assert.match(habitatCss, /\[data-ui-layout='modern'\] \.app-overlay-sheet-card/)
  assert.match(habitatCss, /claim-sheet-draft-form/)
})

test('claim create sheet uses draft form, summary, and manual item sub-sheet', () => {
  assert.match(claimListSource, /ClaimSheetDraftForm/)
  assert.match(claimListSource, /ClaimSheetManualItemSheet/)
  assert.match(draftFormSource, /data-testid="claim-draft-summary"/)
  assert.match(claimListSource, /claim-create-footer-hint/)
  assert.match(draftFormSource, /data-testid="claim-draft-add-manual"/)
  assert.match(customSelectSource, /nested/)
})
