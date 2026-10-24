import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { shiftDayKey, shiftMonthKey } from '../src/ui/utils/home-period-shift.js'

const root = resolve(import.meta.dirname, '..')
const homeSource = readFileSync(resolve(root, 'src/ui/views/home.vue'), 'utf8')
const filterSource = readFileSync(resolve(root, 'src/ui/composables/useHomePeriodFilter.js'), 'utf8')
const bookkeepingSource = readFileSync(resolve(root, 'src/ui/views/BookkeepingPage.vue'), 'utf8')
const quickAddSource = readFileSync(resolve(root, 'src/ui/views/QuickAddPage.vue'), 'utf8')
const calcSource = readFileSync(resolve(root, 'src/ui/components/common/AmountCalculatorInput.vue'), 'utf8')

test('home period chrome is page chrome not a ledger card', () => {
  assert.match(homeSource, /data-testid="home-period-chrome"/)
  assert.match(homeSource, /data-testid="home-period-title"/)
  assert.match(homeSource, /data-testid="home-period-prev"/)
  assert.match(homeSource, /data-testid="home-period-next"/)
  assert.match(homeSource, /data-testid="home-ledger-switcher"/)
  assert.doesNotMatch(homeSource, /class="card ledger-card"/)
  assert.match(filterSource, /periodTitle/)
  assert.match(filterSource, /stepPeriod/)
  assert.match(filterSource, /goPreviousPeriod/)
})

test('shift helpers move local calendar dates', () => {
  assert.equal(shiftDayKey('2026-10-01', -1), '2026-09-30')
  assert.equal(shiftMonthKey('2026-01', -1), '2025-12')
  assert.equal(shiftMonthKey('2026-10', 1), '2026-11')
})

test('quick add embedded path uses inline keypad actions', () => {
  assert.match(quickAddSource, /:inline="embedded"/)
  assert.match(quickAddSource, /confirm-testid="quick-add-create"/)
  assert.match(quickAddSource, /secondary-testid="quick-add-save-and-add"/)
  assert.match(calcSource, /inline/)
  assert.match(calcSource, /emit\('confirm'/)
  assert.match(calcSource, /emit\('secondary'/)
  assert.match(bookkeepingSource, /class="stack bookkeeping-page"/)
})
