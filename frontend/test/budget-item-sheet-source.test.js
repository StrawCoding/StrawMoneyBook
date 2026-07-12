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
const homeRangePickerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/common/HomeRangePicker.vue'),
  'utf8',
)

test('budget item sheet uses the Home range picker for allocation dates', () => {
  assert.match(budgetItemSheetSource, /import HomeRangePicker from '@\/ui\/components\/common\/HomeRangePicker\.vue'/)
  assert.match(budgetItemSheetSource, /<HomeRangePicker/)
  assert.match(budgetItemSheetSource, /mode="day"/)
  assert.match(budgetItemSheetSource, /:multi-select-days="true"/)
  assert.match(budgetItemSheetSource, /:selected-day-numbers="selectedMonthdayValues"/)
  assert.match(budgetItemSheetSource, /@toggle:day-number="toggleMonthdayFromCalendar"/)
  assert.match(budgetItemSheetSource, /class="monthday-picker"/)
  assert.match(budgetItemSheetSource, /budgeting\.sheet\.monthday_pick_label/)
  assert.match(budgetItemSheetSource, /budgeting\.sheet\.monthday_picker_hint/)
  assert.match(budgetItemSheetSource, /applyMonthdayPreset\('all'\)/)
  assert.doesNotMatch(budgetItemSheetSource, /class="monthday-calendar-grid"/)
})

test('home range picker supports calendar multi-select without closing the sheet', () => {
  assert.match(homeRangePickerSource, /multiSelectDays/)
  assert.match(homeRangePickerSource, /selectedDayNumbers/)
  assert.match(homeRangePickerSource, /'toggle:day-number'/)
  assert.match(homeRangePickerSource, /emit\('toggle:day-number', \{ day: parsed\.day, dayKey: iso \}\)/)
  assert.match(homeRangePickerSource, /return\s*\n\s*\}/)
})

test('budgeting page passes the active budget month into the budget item sheet', () => {
  assert.match(budgetingPageSource, /:budget-month="budgetStore\.monthKey"/)
})

test('budget item sheet exposes creation-only cross-month apply-through control', () => {
  assert.match(budgetItemSheetSource, /v-if="!model\.id"/)
  assert.match(budgetItemSheetSource, /budgeting\.sheet\.apply_through_month/)
  assert.match(budgetItemSheetSource, /type="month"/)
  assert.match(budgetItemSheetSource, /applyThroughMonth/)
})
