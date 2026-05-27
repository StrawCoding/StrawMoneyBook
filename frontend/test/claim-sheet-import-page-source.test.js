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

const claimImportBorrowLoanSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetImportBorrowLoanPage.vue'),
  'utf8',
)

const claimImportServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/claim-sheet-import.service.js'),
  'utf8',
)

const draftSessionSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/claim-sheet-import-draft-session.js'),
  'utf8',
)

const loanRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/loan.repo.js'),
  'utf8',
)

const reimbursementServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/services/reimbursement.service.js'),
  'utf8',
)

const i18nServiceSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/i18n.service.js'),
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


test('claim reimbursement import page returns to the originating claim flow instead of raw history back', () => {
  assert.match(claimImportSource, /const returnLink = computed\(\(\) => \{/)
  assert.match(claimImportSource, /if \(isNewDraft\.value\) return \{ name: 'claim-sheets', query: \{ create: '1' \} \}/)
  assert.match(claimImportSource, /return \{ name: 'claim-sheet-edit', params: \{ id: claimId\.value \} \}/)
  assert.match(claimImportSource, /function goBack\(\) \{\s*void router\.replace\(returnLink\.value\)\s*\}/)
  assert.doesNotMatch(claimImportSource, /goBackOrFallback/)
})

test('claim reimbursement import page only handles reimbursement-kind transactions', () => {
  assert.match(claimImportSource, /listClaimSheetImportableReimbursements/)
  assert.doesNotMatch(claimImportSource, /listClaimSheetImportableTransactions/)
  assert.doesNotMatch(claimImportSource, /listClaimSheetImportableBorrowLoans/)
  assert.match(claimImportSource, /CURRENT_KIND = 'reimbursement'/)
  assert.match(claimImportSource, /claimSheetImportKindFromClaimItem\(item\) === CURRENT_KIND/)
})

test('claim sheets expose a dedicated borrow loan import route and page', () => {
  assert.match(routerSource, /name: 'claim-sheet-import-borrow-loan'/)
  assert.match(routerSource, /path: '\/claim-sheets\/:id\/import-borrow-loans'/)
  assert.match(routerSource, /ClaimSheetImportBorrowLoanPage\.vue/)
  assert.match(claimImportBorrowLoanSource, /CURRENT_KIND = 'borrow_loan'/)
  assert.match(claimImportBorrowLoanSource, /listClaimSheetImportableBorrowLoans/)
  assert.match(claimImportBorrowLoanSource, /claim_sheet\.form\.import_borrow_loans/)
  assert.match(claimImportBorrowLoanSource, /claim_sheet\.form\.no_importable_borrow_loan/)
  assert.match(claimImportBorrowLoanSource, /borrowLoanImportTxIds/)
  assert.match(claimImportBorrowLoanSource, /function goBack\(\) \{\s*void router\.replace\(returnLink\.value\)\s*\}/)
})

test('claim forms expose a separate borrow loan import section', () => {
  assert.match(claimListSource, /openBorrowLoanImportPageFromCreateSheet/)
  assert.match(claimListSource, /claim_sheet\.form\.import_borrow_loans/)
  assert.match(claimListSource, /importedBorrowLoanItems\.length/)
  assert.match(claimEditSource, /openBorrowLoanImportPage/)
  assert.match(claimEditSource, /claim_sheet\.form\.import_borrow_loans/)
  assert.match(claimEditSource, /importedBorrowLoanItems\.length/)
})

test('claim import service exposes separate reimbursement and borrow loan listings', () => {
  assert.match(claimImportServiceSource, /export function listClaimSheetImportableReimbursements/)
  assert.match(claimImportServiceSource, /export async function listClaimSheetImportableBorrowLoans/)
  assert.match(claimImportServiceSource, /annotateReimbursementImportTx/)
  assert.match(claimImportServiceSource, /annotateBorrowLoanImportTx/)
})

test('claim sheet draft session persists reimbursement and borrow loan ids separately', () => {
  assert.match(draftSessionSource, /borrowLoanImportTxIds: normalizeIdList\(payload\.borrowLoanImportTxIds\)/)
  assert.match(draftSessionSource, /borrowLoanImportTxIds: normalizeIdList\(parsed\?\.borrowLoanImportTxIds\)/)
  assert.match(claimImportSource, /saveClaimSheetDraftSession\(\{[\s\S]*importTxIds: selectedTxIds\.value/)
  assert.match(claimImportBorrowLoanSource, /saveClaimSheetDraftSession\(\{[\s\S]*borrowLoanImportTxIds: selectedTxIds\.value/)
})

test('claim edit page persists imported borrow loan items with proper income entry type', () => {
  assert.match(claimEditSource, /buildImportedBorrowLoanClaimItems/)
  assert.match(claimEditSource, /buildClaimSheetImportedClaimItem\(tx, t\)/)
  assert.doesNotMatch(claimEditSource, /entryType: 'expense',\s*sourceType: 'transaction',\s*transactionId: tx\.id/)
})

test('SMB-222 v1.2.45: importable lent loans only list outstanding lend setup transactions', () => {
  assert.match(loanRepoSource, /AND t\.type = 'expense'/)
  assert.match(loanRepoSource, /AND l\.direction = 'lend'/)
  assert.match(loanRepoSource, /AND l\.status NOT IN \('settled', 'void'\)/)
  assert.doesNotMatch(loanRepoSource, /AND l\.direction = 'borrow'/)
})

test('SMB-222 v1.2.45: claim sheet i18n strings rename borrow_loan import to lent loans', () => {
  assert.match(i18nServiceSource, /'claim_sheet\.form\.import_borrow_loans': '導入借出'/)
  assert.match(i18nServiceSource, /'claim_sheet\.form\.no_importable_borrow_loan': '目前沒有可導入的未完成借出'/)
  assert.match(i18nServiceSource, /'claim_sheet\.import\.open_borrow_loan': '選擇借出項目'/)
  assert.match(i18nServiceSource, /'claim_sheet\.item_source\.borrow_loan': '導入借出'/)
  assert.doesNotMatch(i18nServiceSource, /'claim_sheet\.form\.import_borrow_loans': '導入借入'/)
})

test('SMB-222 v1.2.45: completing reimbursement clears imported lent loans and reverting restores them', () => {
  assert.match(reimbursementServiceSource, /function clearBorrowLoanClaimSources/)
  assert.match(reimbursementServiceSource, /function restoreBorrowLoanClaimSources/)
  assert.match(reimbursementServiceSource, /await clearBorrowLoanClaimSources\(ledgerId, claimItems\)/)
  assert.match(reimbursementServiceSource, /await restoreBorrowLoanClaimSources\(ledgerId, claimItems\)/)
  assert.match(reimbursementServiceSource, /restoreSoftDeletedLoanById/)
  assert.match(reimbursementServiceSource, /restoreSoftDeletedTransactionsByOriginRef/)
})
