import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const budgetingSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/budgeting.vue'),
  'utf8',
)
const homeBudgetSummarySource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/home/HomeBudgetSummaryCard.vue'),
  'utf8',
)
const sheetSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/budget/BudgetItemSheet.vue'),
  'utf8',
)
const budgetRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/budget.repo.js'),
  'utf8',
)

test('budgeting page exposes detail-first budget item and total save flows', () => {
  assert.doesNotMatch(budgetingSource, /budgeting\.reserved/)
  assert.match(budgetingSource, /@click="openItemDetail\(item\)"/)
  assert.match(budgetingSource, /const detailItem = ref\(null\)/)
  assert.match(budgetingSource, /const isItemDetailOpen = ref\(false\)/)
  assert.match(budgetingSource, /<InputBottomSheet[\s\S]*:open="isItemDetailOpen"/)
  assert.match(budgetingSource, /requestRemoveItemFromDetail/)
  assert.match(budgetingSource, /editDetailItem/)
  assert.match(budgetingSource, /budget-save-inline-row/)
  assert.match(budgetingSource, /itemBudgetSaveSummary\(item\)/)
  assert.doesNotMatch(budgetingSource, /@click="openEdit\(item\)"/)
  assert.doesNotMatch(budgetingSource, /@click="removeItem\(item\.id\)"/)
  assert.match(budgetingSource, /budgeting\.budget_save\.total_title/)
  assert.match(budgetingSource, /@click="openTotalBudgetSaveDetail"/)
  assert.match(budgetingSource, /const isTotalBudgetSaveDetailOpen = ref\(false\)/)
  assert.match(budgetingSource, /const isTotalBudgetSaveConfigOpen = ref\(false\)/)
  assert.match(budgetingSource, /openTotalBudgetSaveConfig/)
  assert.match(budgetingSource, /saveTotalBudgetSaveConfig/)
  assert.match(budgetingSource, /retroactiveModeOptions/)
  assert.match(budgetingSource, /duplicateBudgetSaveCategoryIds/)
  assert.match(budgetingSource, /buildAccountOptionGroups/)
  assert.match(budgetingSource, /:groups="totalSaveTargetGroups"/)
  assert.match(budgetingSource, /:groups="totalSaveSourceGroups"/)
})

test('home budget summary shows reserved amount only in daily mode', () => {
  assert.match(homeBudgetSummarySource, /t\('budgeting\.reserved'\)/)
  assert.match(homeBudgetSummarySource, /budgetStore\.reservedMinor/)
  assert.match(homeBudgetSummarySource, /budgetStore\.reservedMinorByDate\(monthDateMeta\.value\.selectedDate, \{ includeReferenceDay: false \}\)/)
  assert.match(homeBudgetSummarySource, /reservedMinor: currentReservedMinor/)
  assert.match(homeBudgetSummarySource, /v-if="mode\.key === 'daily'"[\s\S]*budgeting\.reserved/)
})

test('budget item sheet exposes item-level budget save controls', () => {
  assert.match(sheetSource, /budgeting\.budget_save\.title/)
  assert.match(sheetSource, /buildAccountOptionGroups/)
  assert.match(sheetSource, /:groups="budgetSaveTargetGroups"/)
  assert.match(sheetSource, /:groups="budgetSaveSourceGroups"/)
  assert.match(sheetSource, /budgetSaveInvalidReason/)
})

test('budget repo qualifies joined sort_order columns to avoid ambiguous column errors', () => {
  assert.match(budgetRepoSource, /bi\.sort_order AS sort_order, c\.name AS category_name/)
})
