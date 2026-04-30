import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const budgetItemSheetSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/budget/BudgetItemSheet.vue'),
  'utf8',
)
const budgetingPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/budgeting.vue'),
  'utf8',
)

test('budget item sheet uses a calendar-style monthday picker for allocation dates', () => {
  assert.match(budgetItemSheetSource, /class="monthday-picker"/)
  assert.match(budgetItemSheetSource, /class="monthday-calendar-grid"/)
  assert.match(budgetItemSheetSource, /budgeting\.sheet\.monthday_picker_hint/)
  assert.match(budgetItemSheetSource, /shiftMonthdayPreview\(-1\)/)
  assert.match(budgetItemSheetSource, /shiftMonthdayPreview\(1\)/)
  assert.match(budgetItemSheetSource, /applyMonthdayPreset\('all'\)/)
})

test('budgeting page passes the active budget month into the budget item sheet', () => {
  assert.match(budgetingPageSource, /:budget-month="budgetStore\.monthKey"/)
})
