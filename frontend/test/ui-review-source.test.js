import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { readI18nBundleSource } from './helpers/i18n-source.js'

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
const habitatCssSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/assets/css/habitat-ui.css'),
  'utf8',
)
const settingsSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings.vue'),
  'utf8',
)
const settingsAccountSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsAccountPage.vue'),
  'utf8',
)
const settingsSharedLedgerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsSharedLedgerPage.vue'),
  'utf8',
)
const eInvoiceImportWizardSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/einvoice/EInvoiceImportWizardPage.vue'),
  'utf8',
)
const loanListSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/loans/LoanListPage.vue'),
  'utf8',
)
const claimSheetListSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/claims/ClaimSheetListPage.vue'),
  'utf8',
)
const subscriptionListSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/subscriptions/SubscriptionListPage.vue'),
  'utf8',
)
const settingsLedgerSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsLedgerPage.vue'),
  'utf8',
)
const i18nSource = readI18nBundleSource()
const viewsDir = resolve(import.meta.dirname, '../src/ui/views')
const settingsViewsDir = resolve(import.meta.dirname, '../src/ui/views/settings')

function listVueFiles(dir) {
  const entries = readdirSync(dir)
  return entries.flatMap((entry) => {
    const path = resolve(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) return listVueFiles(path)
    return path.endsWith('.vue') ? [path] : []
  })
}

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

test('analysis page keeps pie/bar charts with flat panels (no nested card blocks)', () => {
  const chartPairSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/components/analysis/AnalysisIconizedChartPair.vue'),
    'utf8',
  )
  assert.match(analysisPageSource, /AnalysisIconizedChartPair/)
  assert.match(analysisPageSource, /@select="\(item\) => openCategoryBreakdownDetail\(item, 'income'\)"/)
  assert.match(analysisPageSource, /@select="openAccountBreakdownDetail"/)
  assert.match(analysisPageSource, /data-testid="analysis-time-section"/)
  assert.match(chartPairSource, /class="pie-button"/)
  assert.match(chartPairSource, /data-testid="analysis-bar-list"/)
  assert.doesNotMatch(chartPairSource, /analysis-pie-legend/)
  assert.doesNotMatch(chartPairSource, /chart-title/)
  assert.match(chartPairSource, /bar-chart-track/)
  assert.match(chartPairSource, /background: transparent/)
  assert.match(habitatCssSource, /\.analysis-modern \.iconized-chart-pair \.pie-panel/)
  assert.match(habitatCssSource, /\.analysis-modern \.securities-summary-grid \.securities-metric-row[\s\S]*?background: transparent/)
  assert.match(analysisPageSource, /analysis-section-head/)
  assert.match(analysisPageSource, /securities-metric-row/)
  assert.doesNotMatch(
    analysisPageSource,
    /data-testid="analysis-securities-section"[\s\S]*?header-metrics[\s\S]*?totalDisplayValueMinor/,
  )
  assert.match(habitatCssSource, /\.analysis-modern \.budget-card[\s\S]*?background: transparent/)
  assert.match(chartPairSource, /interactive/)
})

test('SMB-178 subpage headers share the ledger sync back header style', () => {
  assert.match(globalCssSource, /header\.row:has\(\.back-btn\)\s*\{[\s\S]*grid-template-columns:\s*40px minmax\(0, 1fr\) 40px;/)
  assert.match(globalCssSource, /header\.row:has\(\.back-btn\)::after\s*\{[\s\S]*grid-column:\s*3;/)
  assert.match(globalCssSource, /header\.row:has\(\.back-btn\) > :is\(h1, h2, \.page-title\)[\s\S]*justify-self:\s*center;/)
  assert.match(eInvoiceImportWizardSource, /class="[^"]*\bback-btn\b/)
  assert.doesNotMatch(eInvoiceImportWizardSource, /\.back-btn\s*\{/)
})

test('SMB-178 page-level back headers are not nested inside content cards', () => {
  const nestedPageHeaderPattern = /<article class="card panel(?: summary)?">\s*<header class="row">\s*<h[12][\s\S]*?class="[^"]*\bback-btn\b/
  const offenders = []
  for (const filePath of listVueFiles(viewsDir)) {
    const source = readFileSync(filePath, 'utf8')
    if (nestedPageHeaderPattern.test(source)) offenders.push(filePath.replace(`${viewsDir}/`, ''))
  }
  assert.deepEqual(offenders, [])
})

test('SMB-178 create buttons use habitat toolbar or panel-head (not legacy page-head)', () => {
  const sourceByName = {
    loanListSource,
    claimSheetListSource,
    subscriptionListSource,
    settingsLedgerSource,
  }
  for (const [name, source] of Object.entries(sourceByName)) {
    assert.match(source, /HabitatPageShell/, `${name} uses HabitatPageShell`)
    const hasToolbarPrimary = /<template #toolbar>[\s\S]*?class="btn primary"/.test(source)
    const hasPanelPrimary = /<article class="card panel(?: summary)?">\s*<header class="row panel-head">[\s\S]*?<button class="btn primary"/.test(source)
    assert.ok(hasToolbarPrimary || hasPanelPrimary, `${name} exposes primary create in toolbar or panel-head`)
    assert.doesNotMatch(source, /<header class="row page-head">(?:(?!<\/header>)[\s\S]*)<button class="btn primary"/, `${name} should not put primary action in legacy page header`)
  }
})

test('settings page shows helper descriptions for each entry', () => {
  assert.match(settingsSource, /class="item-copy"/)
  assert.match(settingsSource, /item\.descKey/)
  assert.doesNotMatch(settingsSource, /desc: '/)
  assert.match(i18nSource, /'settings\.desc\.addon_templates': '建立常用附加項目，快速套用到交易。'/)
  assert.match(i18nSource, /'settings\.desc\.addon_templates': 'Create common add-on items for quick use in transactions.'/)
})

test('SMB-221 settings subpage titles include feature icons', () => {
  const offenders = []
  for (const filePath of listVueFiles(settingsViewsDir)) {
    const source = readFileSync(filePath, 'utf8')
    const titleMatch = source.match(/<h2 class="page-title"[\s\S]*?<\/h2>/)
    if (!titleMatch) continue
    if (!/class="title-icon"/.test(titleMatch[0])) offenders.push(filePath.replace(`${settingsViewsDir}/`, ''))
  }
  assert.deepEqual(offenders, [])
})

test('SMB-154 account and shared ledger pages use registered i18n keys', () => {
  const sourceByName = {
    settingsAccountSource,
    settingsSharedLedgerSource,
  }

  for (const [name, source] of Object.entries(sourceByName)) {
    const keys = [...source.matchAll(/t\(\s*['"]([^'"]+\.[^'"]+)['"]/g)].map((match) => match[1])
    assert.ok(keys.length > 0, `${name} should contain i18n keys`)
    for (const key of new Set(keys)) {
      assert.match(i18nSource, new RegExp(`['"]${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*:`), `${key} is missing from i18n messages`)
    }
  }
})
