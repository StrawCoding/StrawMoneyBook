import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { shiftDayKey, shiftMonthKey } from '../src/ui/utils/home-period-shift.js'

const root = resolve(import.meta.dirname, '..')
const homeSource = readFileSync(resolve(root, 'src/ui/views/home.vue'), 'utf8')
const periodChromeSource = readFileSync(resolve(root, 'src/ui/components/layout/PeriodChrome.vue'), 'utf8')
const filterSource = readFileSync(resolve(root, 'src/ui/composables/useHomePeriodFilter.js'), 'utf8')
const bookkeepingSource = readFileSync(resolve(root, 'src/ui/views/BookkeepingPage.vue'), 'utf8')
const quickAddSource = readFileSync(resolve(root, 'src/ui/views/QuickAddPage.vue'), 'utf8')
const calcSource = readFileSync(resolve(root, 'src/ui/components/common/AmountCalculatorInput.vue'), 'utf8')

test('home period chrome is page chrome not a ledger card', () => {
  assert.match(homeSource, /PeriodChrome/)
  assert.match(homeSource, /chrome-test-id="home-period-chrome"/)
  assert.match(homeSource, /id-prefix="home-period"/)
  assert.match(periodChromeSource, /`\$\{idPrefix\}-title`/)
  assert.match(periodChromeSource, /`\$\{idPrefix\}-prev`/)
  assert.match(periodChromeSource, /`\$\{idPrefix\}-next`/)
  assert.match(homeSource, /data-testid="home-ledger-switcher"/)
  assert.match(homeSource, /hello-test-id="home-hello-block"/)
  const helloAt = homeSource.indexOf('hello-test-id="home-hello-block"')
  const ledgerAt = homeSource.indexOf('data-testid="home-ledger-switcher"')
  const chromeAt = homeSource.indexOf('PeriodChrome')
  assert.ok(helloAt >= 0 && ledgerAt > helloAt && ledgerAt < chromeAt, 'ledger must sit in shell header before period chrome')
  assert.doesNotMatch(homeSource, /period-edit-btn/)
  assert.doesNotMatch(homeSource, /home-period-sheet-trigger/)
  assert.match(homeSource, /#toolbar/)
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
  assert.match(bookkeepingSource, /HabitatPageShell/)
  assert.match(bookkeepingSource, /stack-class="bookkeeping-page"/)
})

test('calculator delete key is not the page back chevron', () => {
  assert.match(calcSource, /class="btn calc-btn calc-back-btn"/)
  assert.match(calcSource, /data-testid="calc-backspace"/)
  assert.doesNotMatch(calcSource, /class="btn calc-btn back-btn"/)
})
