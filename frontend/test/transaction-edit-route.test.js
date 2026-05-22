import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const routerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/router/index.js'),
  'utf8',
)
const aboutSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/TransactionAboutPage.vue'),
  'utf8',
)
const editSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/TransactionEditPage.vue'),
  'utf8',
)
const homeEditSheetSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/home/HomeTransactionEditSheet.vue'),
  'utf8',
)

test('transaction edit page is routed as a standalone screen', () => {
  assert.match(routerSource, /name: 'transaction-edit'/)
  assert.match(routerSource, /path: '\/transactions\/:id\/edit'/)
  assert.match(aboutSource, /router\.push\(\{ name: 'transaction-edit', params: \{ id: tx\.id \} \}\)/)
})

test('transaction edit page reuses quick-add style structure for extra info and grouped selectors', () => {
  assert.match(editSource, /t\('common\.extra_info'\)/)
  assert.match(editSource, /t\('quick_add\.extra\.title'\)/)
  assert.match(editSource, /<CustomSelect v-model="model\.accountId" :groups="directAccountGroups"/)
  assert.match(editSource, /<CustomSelect v-model="model\.peerAccountId" :groups="transferAccountGroups"/)
  assert.match(editSource, /const directAccountGroups = computed\(\(\) => accountStore\.groupedRegularAccounts\)/)
  assert.match(editSource, /const transferAccountGroups = computed\(\(\) => accountStore\.groupedAccounts\)/)
})

test('transaction edit keeps signed adjustment amounts and blocks invalid manual transfer rates', () => {
  assert.match(editSource, /const settledAmountMinorRaw = Math\.round\(settledAmountMajor \* 100\)/)
  assert.match(editSource, /type: 'adjustment',[\s\S]*amountMinor: settledAmountMinorRaw/)
  assert.match(editSource, /const isManualTransferRateInvalid = computed/)
  assert.match(editSource, /:disabled="submitting \|\| isSubmitDisabled"/)
  assert.match(editSource, /uiStore\.pushToast\(t\('quick_add\.error\.invalid_rate'\), 'error'\)/)
})

test('transaction edit syncs category reimbursement defaults with budget and analysis flags', () => {
  assert.match(editSource, /const applyingCategoryDefaults = ref\(false\)/)
  assert.match(editSource, /const hydratingTransactionModel = ref\(false\)/)
  assert.match(editSource, /watch\(\s*\(\) => model\.categoryId,[\s\S]*applyCategoryDefaults\(categoryId\)[\s\S]*\)/)
  assert.match(editSource, /if \(applyingCategoryDefaults\.value \|\| hydratingTransactionModel\.value\) return/)
  assert.match(editSource, /model\.isReimbursable = model\.type === 'expense' && Boolean\(cat\.default_is_reimbursable\)/)
  assert.match(editSource, /model\.includeInBudget = Boolean\(cat\.default_include_in_budget \?\? 1\)/)
  assert.match(editSource, /model\.includeInAnalysis = Boolean\(cat\.default_include_in_analysis \?\? 1\)/)
})

test('home transaction edit sheet also syncs category reimbursement defaults safely', () => {
  assert.match(homeEditSheetSource, /const applyingCategoryDefaults = ref\(false\)/)
  assert.match(homeEditSheetSource, /const hydratingTransactionModel = ref\(false\)/)
  assert.match(homeEditSheetSource, /watch\(\s*\(\) => model\.categoryId,[\s\S]*applyCategoryDefaults\(categoryId\)[\s\S]*\)/)
  assert.match(homeEditSheetSource, /if \(applyingCategoryDefaults\.value \|\| hydratingTransactionModel\.value\) return/)
  assert.match(homeEditSheetSource, /model\.isReimbursable = model\.type === 'expense' && Boolean\(cat\.default_is_reimbursable\)/)
  assert.match(homeEditSheetSource, /model\.includeInBudget = Boolean\(cat\.default_include_in_budget \?\? 1\)/)
  assert.match(homeEditSheetSource, /model\.includeInAnalysis = Boolean\(cat\.default_include_in_analysis \?\? 1\)/)
})
