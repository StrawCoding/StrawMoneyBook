import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const budgetingSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/budgeting.vue'),
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

test('budgeting page exposes monthly total budget save controls', () => {
  assert.match(budgetingSource, /budgeting\.budget_save\.total_title/)
  assert.match(budgetingSource, /saveTotalBudgetSaveConfig/)
  assert.match(budgetingSource, /retroactiveModeOptions/)
  assert.match(budgetingSource, /duplicateBudgetSaveCategoryIds/)
  assert.match(budgetingSource, /buildAccountOptionGroups/)
  assert.match(budgetingSource, /:groups="totalSaveTargetGroups"/)
  assert.match(budgetingSource, /:groups="totalSaveSourceGroups"/)
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
