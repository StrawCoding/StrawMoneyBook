import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appDialogSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/common/AppDialog.vue'),
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
  assert.match(appDialogSource, /dialog-mask-sheet/)
  assert.match(appDialogSource, /sheet app-bottom-sheet dialog-sheet/)
  assert.match(appDialogSource, /app-bottom-sheet-body/)
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
    assert.match(source, /app-bottom-sheet/)
    assert.match(source, /app-bottom-sheet-body/)
  }
})
