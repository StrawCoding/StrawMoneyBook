import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appDialogSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/common/AppDialog.vue'),
  'utf8',
)

const sharedSheetSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/common/InputBottomSheet.vue'),
  'utf8',
)

const appDialogFormFiles = [
  '../src/ui/views/subscriptions/SubscriptionListPage.vue',
  '../src/ui/views/savings-jars/SavingsJarListPage.vue',
  '../src/ui/views/settings/SettingsLedgerPage.vue',
  '../src/ui/views/settings/SettingsCategoryPage.vue',
  '../src/ui/views/accounts/AssetAccountManagementPage.vue',
]

const customSheetFiles = [
  '../src/ui/components/budget/BudgetItemSheet.vue',
  '../src/ui/components/home/HomeTransactionEditSheet.vue',
  '../src/ui/views/QuickAddPage.vue',
  '../src/ui/views/TransactionEditPage.vue',
  '../src/ui/views/loans/LoanListPage.vue',
  '../src/ui/views/loans/LoanCounterpartyDetailPage.vue',
  '../src/ui/views/loans/LoanDetailPage.vue',
  '../src/ui/views/reimbursements/ReimbursementListPage.vue',
  '../src/ui/views/claims/ClaimSheetListPage.vue',
]

test('AppDialog supports rendering form dialogs as bottom sheets', () => {
  assert.match(appDialogSource, /presentation: \{/)
  assert.match(appDialogSource, /default: 'dialog'/)
  assert.match(appDialogSource, /<InputBottomSheet/)
  assert.match(appDialogSource, /props\.presentation === 'sheet'/)
  assert.match(sharedSheetSource, /app-overlay-sheet-mask/)
  assert.match(sharedSheetSource, /app-bottom-sheet-body/)
  assert.match(sharedSheetSource, /app-overlay-sheet-handle/)
})

test('input-heavy dialogs opt into the bottom sheet presentation', () => {
  for (const relativePath of appDialogFormFiles) {
    const source = readFileSync(resolve(import.meta.dirname, relativePath), 'utf8')
    assert.match(source, /presentation="sheet"/)
  }
})

test('custom form sheets reuse the shared bottom-sheet layout primitives', () => {
  for (const relativePath of customSheetFiles) {
    const source = readFileSync(resolve(import.meta.dirname, relativePath), 'utf8')
    assert.match(source, /<InputBottomSheet/)
  }
})

test('legacy category picker overlays were removed from custom transaction and budget sheets', () => {
  const budgetSource = readFileSync(resolve(import.meta.dirname, '../src/ui/components/budget/BudgetItemSheet.vue'), 'utf8')
  const homeEditSource = readFileSync(resolve(import.meta.dirname, '../src/ui/components/home/HomeTransactionEditSheet.vue'), 'utf8')
  assert.doesNotMatch(budgetSource, /showCategoryPicker|openCategoryPicker|closeCategoryPicker|pickCategory/)
  assert.doesNotMatch(homeEditSource, /showCategoryPicker|openCategoryPicker|closeCategoryPicker|pickCategory/)
})
