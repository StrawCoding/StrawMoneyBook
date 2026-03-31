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

const claimDetailSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetDetailPage.vue'),
  'utf8',
)

const pdfServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/claim-sheet-pdf.service.js'),
  'utf8',
)

test('claim sheet items route to a standalone detail page and keep list actions focused on completion', () => {
  assert.match(routerSource, /name: 'claim-sheet-edit'/)
  assert.match(routerSource, /path: '\/claim-sheets\/:id\/edit'/)
  assert.match(routerSource, /name: 'claim-sheet-detail'/)
  assert.match(routerSource, /path: '\/claim-sheets\/:id'/)
  assert.match(claimListSource, /router\.push\(\{\s+name: 'claim-sheet-detail',[\s\S]*params: \{ id: claim\.id \}/)
  assert.match(claimListSource, /class="btn primary claim-complete-btn"/)
  assert.match(claimListSource, /class="claim-meta-group muted"/)
  assert.match(claimListSource, /class="row claim-meta claim-date-row"/)
  assert.doesNotMatch(claimListSource, /@click="openEditSheet\(claim\)"/)
  assert.doesNotMatch(claimListSource, /@click="exportClaim\(claim\)"/)
})

test('claim sheet detail page supports edit handoff and export reopen actions', () => {
  assert.match(claimDetailSource, /name: 'claim-sheet-edit'/)
  assert.match(claimDetailSource, /params: \{ id: claimId\.value \}/)
  assert.match(claimDetailSource, /query: backTab\.value === 'completed' \? \{ tab: 'completed' \} : \{\}/)
  assert.match(claimDetailSource, /<div v-if="exportedUrl" class="row export-open-row">/)
  assert.match(claimDetailSource, /t\('analysis_print\.open_link'\)/)
  assert.match(claimDetailSource, /const opened = openFileUrl\(exportedUrl\.value\)/)
  assert.match(claimDetailSource, /savePdfFileToDevice\(pdfFile\.filename, pdfFile\.blob, \{ category: 'claim-sheets' \}\)/)
  assert.match(claimDetailSource, /await deleteReimbursement\(ledgerStore\.activeLedgerId, claim\.value\.id\)/)
})

test('claim sheet edit page is a standalone route and saves draft updates directly', () => {
  const claimEditSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetEditPage.vue'),
    'utf8',
  )

  assert.match(claimEditSource, /await updateReimbursementDraft\(ledgerStore\.activeLedgerId, claimId\.value, \{/)
  assert.match(claimEditSource, /name: 'claim-sheet-detail'/)
  assert.match(claimEditSource, /getReimbursementDetail\(ledgerStore\.activeLedgerId, claimId\.value\)/)
  assert.match(claimEditSource, /for \(const tx of reimbursementStore\.pendingItems\)/)
  assert.match(claimEditSource, /for \(const tx of selectedImportedDraftItems\.value\)/)
})

test('claim sheet edit handoff waits for an active ledger before clearing the edit query', () => {
  assert.match(claimListSource, /const createSheetBootstrapReady = ref\(false\)/)
  assert.match(claimListSource, /createSheetBootstrapReady\.value = false/)
  assert.match(claimListSource, /createSheetBootstrapReady\.value = true/)
  assert.match(claimListSource, /watch\(\s+\[\(\) => route\.query\.edit, \(\) => ledgerStore\.activeLedgerId, createSheetBootstrapReady\],/)
  assert.match(claimListSource, /if \(!String\(nextEditId \?\? ''\)\.trim\(\) \|\| !String\(nextLedgerId \?\? ''\)\.trim\(\) \|\| !isBootstrapReady\) return/)
  assert.match(claimListSource, /if \(!claimId \|\| !String\(ledgerStore\.activeLedgerId \?\? ''\)\.trim\(\)\) return/)
  assert.match(claimListSource, /let shouldClearEditQuery = false/)
  assert.match(claimListSource, /if \(shouldClearEditQuery && String\(route\.query\.edit \?\? ''\)\.trim\(\)\)/)
  assert.match(claimListSource, /if \(!String\(route\.query\.edit \?\? ''\)\.trim\(\) && !isEditingCreateForm\.value && !isCreateOpen\.value\) \{\s+resetCreateForm\(\)\s+\}/)
})

test('claim sheet completion returns home after success', () => {
  assert.match(claimListSource, /await router\.replace\(\{ name: 'home' \}\)/)
})

test('claim sheet pdf service renders html into paged pdf output', () => {
  assert.match(pdfServiceSource, /import html2canvas from 'html2canvas'/)
  assert.match(pdfServiceSource, /import \{ jsPDF \} from 'jspdf'/)
  assert.match(pdfServiceSource, /currentPage\.page\.scrollHeight > currentPage\.page\.clientHeight/)
  assert.match(pdfServiceSource, /currentPage = appendPage\(false\)/)
  assert.match(pdfServiceSource, /for \(const \[index, \{ page \}\] of pages\.entries\(\)\)/)
  assert.match(pdfServiceSource, /return html2canvas\(page, \{/)
  assert.match(pdfServiceSource, /pdf\.addImage\(imageData, 'PNG'/)
  assert.match(pdfServiceSource, /filename: `\$\{filenameTitle\}_\$\{filenameId\}\.pdf`/)
})
