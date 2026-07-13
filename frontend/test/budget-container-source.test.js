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
const homePeriodFilterSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/composables/useHomePeriodFilter.js'),
  'utf8',
)
const transactionRepoSource = readFileSync(
  resolve(import.meta.dirname, '../src/core/repositories/transaction.repo.js'),
  'utf8',
)
const appRuntimeSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/app-runtime.service.js'),
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
  assert.match(budgetStoreSource, /computeMonthlyReservedMinor/)
  assert.match(budgetStoreSource, /isMonthOver/)
  assert.match(budgetStoreSource, /saveBudgetContainerRange/)
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

test('budget item and pool sheets expose ledger budget period settings', () => {
  for (const source of [itemSheetSource, containerSheetSource]) {
    assert.match(source, /budgeting\.period\.sheet_title/)
    assert.match(source, /budgeting\.period\.sheet_scope_hint/)
    assert.match(source, /ledgerBudgetPeriodSettings/)
    assert.match(source, /settings_ledger_detail\.budget_period_mode\.calendar_month/)
    assert.match(source, /settings_ledger_detail\.budget_period_mode\.pay_cycle/)
    assert.match(source, /settings_ledger_detail\.budget_pay_day/)
  }
  assert.match(itemSheetSource, /data-testid="budget-item-period-pay-cycle"/)
  assert.match(containerSheetSource, /data-testid="budget-container-period-pay-cycle"/)
})

test('budgeting page saves ledger budget period settings from budget workflows', () => {
  assert.match(budgetingSource, /:ledger-budget-period-mode="activeLedgerBudgetPeriodMode"/)
  assert.match(budgetingSource, /:ledger-budget-pay-day="activeLedgerBudgetPayDay"/)
  assert.match(budgetingSource, /updateBudgetPeriodSettings/)
  assert.match(budgetingSource, /loadCurrentPeriod/)
  assert.match(budgetingSource, /shouldApplyBudgetPeriodSettings/)
})

test('budget store resolves startup pay-cycle period from the current date, not month start', () => {
  assert.match(budgetStoreSource, /function dateKeyForTimeZone/)
  assert.match(budgetStoreSource, /ledgerStore\.activeLedger\?\.timezone/)
  assert.match(budgetStoreSource, /resolveBudgetPeriodForLedger\(\s*ledgerStore\.activeLedger,\s*dateKeyForTimeZone/)
  assert.doesNotMatch(budgetStoreSource, /resolveBudgetPeriodForLedger\(ledgerStore\.activeLedger,\s*monthKeyFromDate\(\)\)/)
})

test('startup month sync never treats pay-cycle period keys as calendar months', () => {
  assert.match(budgetStoreSource, /function normalizeBudgetMonthInput/)
  assert.match(budgetStoreSource, /\^pay:\(\\d\{4\}-\\d\{2\}-\\d\{2\}\)/)
  assert.match(homePeriodFilterSource, /normalizeMonthKey\(budgetStore\.monthKey\) \|\| monthKeyFromDate/)
  assert.doesNotMatch(homePeriodFilterSource, /ref\(budgetStore\.monthKey \|\| monthKeyFromDate/)
  assert.match(transactionRepoSource, /function parseMonthKey/)
  assert.match(transactionRepoSource, /if \(!range\) return \[\]/)
  assert.match(transactionRepoSource, /if \(!range\) return null/)
})

test('app lifecycle reloads the current budget period from today', () => {
  assert.match(appRuntimeSource, /useBudgetStore/)
  assert.match(appRuntimeSource, /reloadCurrentBudgetPeriodInBackground/)
  assert.match(appRuntimeSource, /loadCurrentPeriod\(\)/)
  assert.match(appRuntimeSource, /appStateChange/)
  assert.match(appRuntimeSource, /window_focus/)
  assert.match(appRuntimeSource, /visibilitychange/)
})

test('budget container sheet exposes pool amount and savings controls', () => {
  assert.match(containerSheetSource, /budgeting\.container\.name/)
  assert.match(containerSheetSource, /budgeting\.container\.amount/)
  assert.match(containerSheetSource, /budgeting\.container\.period_mode/)
  assert.match(containerSheetSource, /budgeting\.container\.fill_child_sum/)
  assert.match(containerSheetSource, /budgeting\.container\.budget_save_hint/)
  assert.match(containerSheetSource, /budgeting\.container\.categories_field/)
  assert.match(containerSheetSource, /model\.categoryIds/)
})

test('budget container sheet exposes creation-only cross-month apply-through control', () => {
  assert.match(budgetingSource, /:budget-month="budgetStore\.monthKey"/)
  assert.match(containerSheetSource, /v-if="!model\.id"/)
  assert.match(containerSheetSource, /budgeting\.container\.apply_through_month/)
  assert.match(containerSheetSource, /type="month"/)
  assert.match(containerSheetSource, /applyThroughMonth/)
})

test('budget item sheet hides amount fields for daily pool bindings', () => {
  assert.match(itemSheetSource, /isDailyPoolBinding/)
  assert.match(itemSheetSource, /budgeting\.container\.daily_pool_item_hint/)
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
