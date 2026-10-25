import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const displaySource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/BudgetDisplayPage.vue'),
  'utf8',
)
const calendarSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/budget/BudgetMonthCalendar.vue'),
  'utf8',
)
const tableSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/budget/BudgetCategoryTable.vue'),
  'utf8',
)
const routerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/router/index.js'),
  'utf8',
)
const settingsSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/budgeting.vue'),
  'utf8',
)
const storeSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/stores/budget.store.js'),
  'utf8',
)

test('budget display and settings are split onto separate routes', () => {
  assert.match(routerSource, /path: '\/budget'/)
  assert.match(routerSource, /BudgetDisplayPage\.vue/)
  assert.match(routerSource, /path: '\/budget\/settings'/)
  assert.match(routerSource, /budgeting\.vue/)
  assert.match(displaySource, /data-testid="budget-display-page"/)
  assert.match(displaySource, /data-testid="budget-display-settings"/)
  assert.match(displaySource, /to="\/budget\/settings"/)
  assert.match(settingsSource, /data-testid="budget-settings-page"/)
  assert.match(settingsSource, /to="\/budget"/)
  assert.match(settingsSource, /budgeting\.settings_title/)
  assert.doesNotMatch(settingsSource, /BudgetDailyStatsTable/)
})

test('budget display calendar only paints in-period budget expense', () => {
  assert.match(calendarSource, /data-testid="budget-month-calendar"/)
  assert.match(calendarSource, /buildBudgetMonthCalendarCells/)
  assert.match(calendarSource, /cell\.spentMinor > 0/)
  assert.match(calendarSource, /faded: cell\.dateKey && !cell\.inPeriod/)
  assert.match(displaySource, /include_in_budget/)
  assert.match(storeSource, /spentByCategoryOnDay/)
})

test('daily pool children show period spent and stay out of own budget math', () => {
  assert.match(tableSource, /itemDisplaySpentMinor/)
  assert.match(tableSource, /itemDisplayBudgetMinor/)
  assert.match(tableSource, /itemDisplayRemainMinor/)
  assert.doesNotMatch(tableSource, /itemTodaySpentMinor/)
  assert.match(displaySource, /itemDisplaySpentMinor/)
  assert.match(settingsSource, /itemDisplaySpentMinor/)
})

test('budget category table is read-only and can deep-link to settings', () => {
  assert.match(tableSource, /data-testid="budget-category-table"/)
  assert.match(tableSource, /normalizeFaIcon/)
  assert.match(tableSource, /fa-solid fa-vault/)
  assert.match(displaySource, /focus: 'item'/)
  assert.match(settingsSource, /applyFocusFromQuery/)
})
