import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const globalCssSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/assets/css/global.css'),
  'utf8',
)

const sourceFiles = [
  '../src/ui/components/budget/BudgetItemSheet.vue',
  '../src/ui/views/loans/LoanListPage.vue',
  '../src/ui/views/loans/LoanCounterpartyDetailPage.vue',
  '../src/ui/views/reimbursements/ReimbursementListPage.vue',
  '../src/ui/views/QuickAddPage.vue',
  '../src/ui/views/loans/LoanDetailPage.vue',
  '../src/ui/components/home/HomeTransactionEditSheet.vue',
  '../src/ui/views/claims/ClaimSheetListPage.vue',
]

test('global bottom sheet utility caps height at 90dvh and enables internal scrolling', () => {
  assert.match(globalCssSource, /\.app-bottom-sheet \{[\s\S]*max-height: min\(90dvh, calc\(100dvh - max\(8px, var\(--status-bar-height\)\)\)\)/)
  assert.match(globalCssSource, /\.app-bottom-sheet-body \{[\s\S]*overflow-y: auto;/)
})

test('bottom sheet views adopt the shared layout utility', () => {
  for (const relativePath of sourceFiles) {
    const source = readFileSync(resolve(import.meta.dirname, relativePath), 'utf8')
    assert.match(source, /app-bottom-sheet/)
    assert.match(source, /app-bottom-sheet-body/)
  }
})
