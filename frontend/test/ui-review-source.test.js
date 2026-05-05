import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const globalCssSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/assets/css/global.css'),
  'utf8',
)
const homeFeedSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/home/HomeTransactionFeed.vue'),
  'utf8',
)
const homeBudgetSummarySource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/components/home/HomeBudgetSummaryCard.vue'),
  'utf8',
)
const analysisPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/analysis.vue'),
  'utf8',
)
const settingsSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings.vue'),
  'utf8',
)
const i18nSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/i18n.service.js'),
  'utf8',
)

test('global styles allow text selection by default while preserving shared tokens', () => {
  assert.match(globalCssSource, /--radius-sm: 10px;/)
  assert.match(globalCssSource, /--radius-md: 12px;/)
  assert.match(globalCssSource, /--radius-lg: 16px;/)
  assert.match(globalCssSource, /--text-xs: 12px;/)
  assert.match(globalCssSource, /--text-sm: 13px;/)
  assert.match(globalCssSource, /html,\s*body,\s*#app[\s\S]*-webkit-user-select: text;/)
  assert.match(globalCssSource, /\*\s*\{\s*box-sizing: border-box;\s*\}/)
})

test('home transaction feed exposes an actionable empty state', () => {
  assert.match(homeFeedSource, /class="empty-state"/)
  assert.match(homeFeedSource, /fa-solid fa-receipt/)
  assert.match(homeFeedSource, /home_tx\.empty_hint/)
  assert.match(i18nSource, /目前還沒有符合範圍的交易/)
  assert.match(homeFeedSource, /to="\/transactions\/quick-add"/)
})

test('home budget summary uses a higher swipe threshold to reduce accidental page changes', () => {
  assert.match(homeBudgetSummarySource, /const SWIPE_THRESHOLD_PX = 72/)
})

test('analysis page makes pie charts interactive with responsive sizing', () => {
  assert.match(analysisPageSource, /class="pie-button"/)
  assert.match(analysisPageSource, /openCategoryBreakdownDetail\(activePieTarget\)/)
  assert.match(analysisPageSource, /openAccountBreakdownDetail\(accountActivePieTarget\)/)
  assert.match(analysisPageSource, /width: min\(220px, 56vw\);/)
  assert.match(analysisPageSource, /transform: translateY\(-2px\) scale\(1\.01\);/)
})

test('settings page shows helper descriptions for each entry', () => {
  assert.match(settingsSource, /class="item-copy"/)
  assert.match(settingsSource, /item\.descKey/)
  assert.doesNotMatch(settingsSource, /desc: '/)
  assert.match(i18nSource, /'settings\.desc\.addon_templates': '建立常用附加項目，快速套用到交易。'/)
  assert.match(i18nSource, /'settings\.desc\.bank_sync': '管理銀行連線、同步規則與待匯入交易。'/)
  assert.match(i18nSource, /'settings\.desc\.addon_templates': 'Create common add-on items for quick use in transactions.'/)
  assert.match(i18nSource, /'settings\.desc\.bank_sync': 'Manage bank connections, sync rules, and pending imports.'/)
})
