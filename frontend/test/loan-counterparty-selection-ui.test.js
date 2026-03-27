import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const listSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/loans/LoanListPage.vue'),
  'utf8',
)
const counterpartySource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/loans/LoanCounterpartyDetailPage.vue'),
  'utf8',
)

test('loan list no longer exposes full-list CSV export from the overview page', () => {
  assert.doesNotMatch(listSource, /@click="exportCsv"/)
  assert.doesNotMatch(listSource, /function exportCsv\(/)
})

test('loan counterparty detail uses selection dock and selected batch repayment flow', () => {
  assert.match(counterpartySource, /class="selection-dock card"/)
  assert.match(counterpartySource, /v-if="isSelectionDockVisible"/)
  assert.match(counterpartySource, /toggleSelectAllVisible/)
  assert.match(counterpartySource, /selectionActionSheetOpen/)
  assert.match(counterpartySource, /repayBatchByLoanIds/)
  assert.match(counterpartySource, /scopeName: counterpartyName\.value/)
  assert.match(counterpartySource, /<transition name="select-all-label" mode="out-in">/)
})

test('loan counterparty detail hides selection dock behind sheets and removes checkbox tap highlight', () => {
  assert.match(counterpartySource, /const isSelectionDockVisible = computed\(\(\) => \{/)
  assert.match(counterpartySource, /&& !selectionActionSheetOpen\.value/)
  assert.match(counterpartySource, /\.entry-select \{[\s\S]*align-items: center;[\s\S]*-webkit-tap-highlight-color: transparent;/)
  assert.match(counterpartySource, /\.entry-select-mark \{[\s\S]*-webkit-tap-highlight-color: transparent;/)
})
