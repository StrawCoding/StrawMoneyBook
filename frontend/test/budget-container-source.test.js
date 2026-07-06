import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const budgetingSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/budgeting.vue'),
  'utf8',
)
const itemSheetSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/budget/BudgetItemSheet.vue'),
  'utf8',
)
const containerSheetSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/budget/BudgetContainerSheet.vue'),
  'utf8',
)
const budgetRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/budget.repo.js'),
  'utf8',
)
const budgetStoreSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/stores/budget.store.js'),
  'utf8',
)
const homeBudgetSummarySource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/home/HomeBudgetSummaryCard.vue'),
  'utf8',
)

test('budget repo exposes shared budget container CRUD and item binding columns', () => {
  assert.match(budgetRepoSource, /export async function listBudgetContainers/)
  assert.match(budgetRepoSource, /export async function upsertBudgetContainer/)
  assert.match(budgetRepoSource, /export async function deleteBudgetContainer/)
  assert.match(budgetRepoSource, /bi\.budget_container_id/)
  assert.match(budgetRepoSource, /period_mode/)
})

test('budget store uses 2B total formula and grouped sections', () => {
  assert.match(budgetStoreSource, /containers:/)
  assert.match(budgetStoreSource, /filter\(\(item\) => !isItemInContainer\(item\)\)/)
  assert.match(budgetStoreSource, /groupedBudgetSections/)
  assert.match(budgetStoreSource, /isMonthOver/)
})

test('budgeting page exposes shared budget pool UI flows', () => {
  assert.match(budgetingSource, /budgeting\.container\.add/)
  assert.match(budgetingSource, /groupedBudgetSections/)
  assert.match(budgetingSource, /BudgetContainerSheet/)
  assert.match(budgetingSource, /month-over/)
  assert.match(budgetingSource, /:containers="budgetStore\.containers"/)
})

test('budget item sheet exposes shared budget pool selector', () => {
  assert.match(itemSheetSource, /budgeting\.container\.item_field/)
  assert.match(itemSheetSource, /budgeting\.container\.none/)
  assert.match(itemSheetSource, /model\.budgetContainerId/)
})

test('budget container sheet exposes pool amount and savings controls', () => {
  assert.match(containerSheetSource, /budgeting\.container\.name/)
  assert.match(containerSheetSource, /budgeting\.container\.amount/)
  assert.match(containerSheetSource, /budgeting\.container\.period_mode/)
  assert.match(containerSheetSource, /budgeting\.container\.fill_child_sum/)
  assert.match(containerSheetSource, /budgeting\.container\.budget_save_hint/)
})

test('budgeting page uses progress bars for budget items and pools', () => {
  assert.match(budgetingSource, /BudgetProgressBar/)
  assert.doesNotMatch(budgetingSource, /BudgetMiniPie/)
  assert.match(budgetingSource, /item-progress/)
  assert.match(budgetingSource, /container-progress/)
})

test('home budget summary uses month-level over budget getter for 3C', () => {
  assert.match(homeBudgetSummarySource, /budgetStore\.isMonthOver/)
})
