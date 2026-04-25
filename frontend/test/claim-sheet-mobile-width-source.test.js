import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const claimListSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetListPage.vue'),
  'utf8',
)

const claimDetailSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetDetailPage.vue'),
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

test('claim sheet list page keeps rows within mobile width', () => {
  assert.match(claimListSource, /\.claim-row \{[\s\S]*min-width: 0;/)
  assert.match(claimListSource, /\.claim-head \{[\s\S]*min-width: 0;/)
  assert.match(claimListSource, /\.claim-info strong,[\s\S]*overflow-wrap: anywhere;/)
  assert.match(claimListSource, /@media \(max-width: 720px\) \{[\s\S]*\.claim-row,[\s\S]*flex-direction: column;/)
})

test('claim sheet detail page wraps long content instead of overflowing', () => {
  assert.match(claimDetailSource, /\.claim-title \{[\s\S]*min-width: 0;/)
  assert.match(claimDetailSource, /\.detail-item-head \{[\s\S]*min-width: 0;/)
  assert.match(claimDetailSource, /\.detail-note \{[\s\S]*overflow-wrap: anywhere;/)
  assert.match(claimDetailSource, /@media \(max-width: 720px\) \{[\s\S]*\.claim-head,[\s\S]*flex-direction: column;/)
})

test('claim sheet edit and import pages use shrinkable import columns and wrapping copy', () => {
  assert.match(claimImportSource, /grid-template-columns: auto minmax\(0, 1fr\) auto;/)
  assert.match(claimEditSource, /\.manual-item-preview \{[\s\S]*min-width: 0;/)
  assert.match(claimEditSource, /\.manual-item-preview small,[\s\S]*overflow-wrap: anywhere;/)
  assert.match(claimImportSource, /\.import-item-text small,[\s\S]*overflow-wrap: anywhere;/)
  assert.match(claimEditSource, /@media \(max-width: 720px\) \{[\s\S]*\.action-row \{[\s\S]*flex-wrap: wrap;/)
})
