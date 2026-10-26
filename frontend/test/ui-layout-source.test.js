import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readI18nBundleSource } from './helpers/i18n-source.js'

const root = resolve(import.meta.dirname, '..')
const mainJsSource = readFileSync(resolve(root, 'src/main.js'), 'utf8')
const iconRegistrySource = readFileSync(resolve(root, 'src/ui/utils/fa-icon-registry.js'), 'utf8')

const bottomNavSource = readFileSync(resolve(root, 'src/ui/components/layout/BottomNav.vue'), 'utf8')
const homeSource = readFileSync(resolve(root, 'src/ui/views/home.vue'), 'utf8')
const analysisSource = readFileSync(resolve(root, 'src/ui/views/analysis.vue'), 'utf8')
const assetsSource = readFileSync(resolve(root, 'src/ui/views/assets.vue'), 'utf8')
const personalizationSource = readFileSync(resolve(root, 'src/ui/views/settings/SettingsPersonalizationPage.vue'), 'utf8')
const routerSource = readFileSync(resolve(root, 'src/ui/router/index.js'), 'utf8')
const layoutServiceSource = readFileSync(resolve(root, 'src/ui/services/ui-layout.service.js'), 'utf8')
const i18nSource = readI18nBundleSource()
const appRuntimeSource = readFileSync(resolve(root, 'src/ui/services/app-runtime.service.js'), 'utf8')
const featuresMapSource = readFileSync(resolve(root, 'StrawMoneyBook_Features_Map.md'), 'utf8')
const detailedDocSource = readFileSync(resolve(import.meta.dirname, '../../StrawMoneyBook_App_Features_Detailed.md'), 'utf8')
const playwrightSource = readFileSync(resolve(root, 'scripts/playwright-ui-layout.mjs'), 'utf8')
const habitatCssSource = readFileSync(resolve(root, 'src/ui/assets/css/habitat-ui.css'), 'utf8')
const habitatShellSource = readFileSync(resolve(root, 'src/ui/components/layout/HabitatPageShell.vue'), 'utf8')
const featureListSource = readFileSync(resolve(root, 'src/ui/views/FeatureListPage.vue'), 'utf8')
const settingsSource = readFileSync(resolve(root, 'src/ui/views/settings.vue'), 'utf8')
const bookkeepingSource = readFileSync(resolve(root, 'src/ui/views/BookkeepingPage.vue'), 'utf8')
const appleCssSource = readFileSync(resolve(root, 'src/ui/assets/css/apple-ui.css'), 'utf8')

const UI_LAYOUT_ICON_FILES = [
  resolve(root, 'src/ui/components/layout/BottomNav.vue'),
  resolve(root, 'src/ui/views/home.vue'),
  resolve(root, 'src/ui/views/settings/SettingsPersonalizationPage.vue'),
  resolve(root, 'src/ui/views/FeatureListPage.vue'),
]

function faKebabToImportName(iconClass) {
  const kebab = String(iconClass).replace(/^fa-solid fa-/, '')
  return `fa${kebab.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`
}

function collectFaSolidIcons(source) {
  const matches = source.matchAll(/fa-solid fa-[a-z0-9-]+/g)
  return [...new Set([...matches].map((match) => match[0]))]
}

function collectRegisteredIconImports(source) {
  const importBlock = source.match(/from '@fortawesome\/free-solid-svg-icons'[\s\S]*?\}/)?.[0] ?? ''
  const iconsArrayBlock = source.match(/const (?:icons|solidIcons) = \[([\s\S]*?)\]/)?.[1] ?? ''
  const names = new Set()
  for (const match of `${importBlock}\n${iconsArrayBlock}`.matchAll(/\b(fa[A-Z][A-Za-z0-9]*)\b/g)) {
    names.add(match[1])
  }
  return names
}

const registeredIcons = collectRegisteredIconImports(iconRegistrySource)

test('ui-layout surfaces only use FontAwesome icons registered in fa-icon-registry', () => {
  const missing = []
  for (const filePath of UI_LAYOUT_ICON_FILES) {
    const source = readFileSync(filePath, 'utf8')
    for (const iconClass of collectFaSolidIcons(source)) {
      const importName = faKebabToImportName(iconClass)
      if (!registeredIcons.has(importName)) {
        missing.push({ filePath, iconClass, importName })
      }
    }
  }
  assert.deepEqual(
    missing,
    [],
    `Unregistered icons: ${missing.map((item) => `${item.filePath}: ${item.iconClass} -> ${item.importName}`).join('; ')}`,
  )
})

test('bottom nav keeps 5 tabs in both layouts (no /more or 4-tab CTA)', () => {
  assert.doesNotMatch(bottomNavSource, /MODERN_NAV_ITEMS/)
  assert.doesNotMatch(bottomNavSource, /to: '\/more'/)
  assert.doesNotMatch(bottomNavSource, /isCta: true/)
  assert.match(bottomNavSource, /fa-solid fa-grip/)
  assert.match(bottomNavSource, /to: '\/features'/)
  assert.match(bottomNavSource, /class="bottom-nav modern"/)
  assert.doesNotMatch(bottomNavSource, /useUiLayout/)
})

test('bookkeeping fullscreen route uses HabitatPageShell and segment pills', () => {
  assert.match(bookkeepingSource, /HabitatPageShell/)
  assert.match(bookkeepingSource, /bookkeeping\.habitat_hello/)
  assert.match(bookkeepingSource, /(?:data-testid|hello-test-id)="bookkeeping-page-header"/)
  assert.match(bookkeepingSource, /segment-pills/)
})

test('HabitatPageShell rolls out to tab-adjacent routes with global modern CSS', () => {
  assert.match(habitatShellSource, /class="view-root habitat-page"/)
  assert.match(habitatShellSource, /showDeckKicker/)
  assert.match(habitatShellSource, /isModern/)
  assert.match(habitatCssSource, /panel-kicker/)
  assert.match(habitatCssSource, /Keep metric muted/)
  assert.match(featureListSource, /HabitatPageShell/)
  assert.match(featureListSource, /feature_list\.habitat_hello/)
  assert.match(settingsSource, /HabitatPageShell/)
  assert.match(settingsSource, /settings_page\.habitat_hello/)
  assert.match(habitatCssSource, /Global Habitat \(modern layout, all routes\)/)
  assert.match(habitatCssSource, /\[data-ui-layout='modern'\] \.page-container \.card\.panel/)
  assert.match(i18nSource, /'feature_list\.habitat_hello'/)
  assert.match(i18nSource, /'settings_page\.habitat_hello'/)
})

test('analysis and assets use habitat modern shells (Daak/Finch IA)', () => {
  assert.match(analysisSource, /HabitatPageShell/)
  assert.match(analysisSource, /root-class="analysis-modern"/)
  assert.match(analysisSource, /hello-test-id="analysis-hello-block"/)
  assert.match(analysisSource, /chrome-test-id="analysis-period-chrome"/)
  assert.match(analysisSource, /data-testid="analysis-period-filter"/)
  assert.match(analysisSource, /analysis_page\.habitat_hello/)
  assert.doesNotMatch(analysisSource, /class="card panel analysis-hero-card"/)
  assert.match(assetsSource, /HabitatPageShell/)
  assert.match(assetsSource, /root-class="assets-modern"/)
  assert.match(assetsSource, /hello-test-id="assets-hello-block"/)
  assert.match(assetsSource, /assets_page\.habitat_hello/)
  assert.match(assetsSource, /vault-summary-card/)
  assert.match(assetsSource, /data-testid="assets-lend-entry"/)
  assert.match(assetsSource, /data-testid="assets-drill-list"/)
  assert.match(analysisSource, /data-testid="analysis-toolbar"/)
  assert.match(analysisSource, /toolbar-cluster/)
  assert.match(analysisSource, /segment-pills/)
  assert.match(habitatCssSource, /\[data-ui-layout='modern'\] \.analysis-modern \.analysis-hero-card \.split-card\.income/)
  assert.match(habitatCssSource, /\[data-ui-layout='modern'\] \.assets-modern \.vault-summary-card/)
  assert.match(habitatCssSource, /\[data-ui-layout='modern'\] \.assets-modern \.vault-summary-card[\s\S]*?gap:\s*10px/)
  assert.match(habitatCssSource, /\[data-ui-layout='modern'\] \.assets-modern \.vault-drill-list/)
  assert.doesNotMatch(habitatCssSource, /\[data-ui-layout='modern'\] \.page-container \.vault-drill-list/)
  assert.match(i18nSource, /'analysis_page\.habitat_hello'/)
  assert.match(i18nSource, /'assets_page\.habitat_hello'/)
  assert.match(habitatCssSource, /\[data-ui-layout='modern'\] \.habitat-page \.habitat-kicker[\s\S]*?display:\s*none/)
  assert.match(homeSource, /home_page\.habitat_hello/)
  assert.match(homeSource, /PeriodChrome/)
  assert.match(analysisSource, /PeriodChrome/)
  assert.match(analysisSource, /analysis-flow-hero/)
  assert.match(analysisSource, /analysis-flow-section/)
  assert.doesNotMatch(featureListSource, /feature-advanced-details/)
  assert.doesNotMatch(featureListSource, /class="card panel"/)
  assert.match(assetsSource, /data-testid="assets-ledger-switcher"/)
  assert.doesNotMatch(assetsSource, /ledger-kicker/)
})

test('ledger switcher uses plain trigger without select chrome', () => {
  const ledgerSwitcherSource = readFileSync(
    resolve(root, 'src/ui/components/common/LedgerSwitcher.vue'),
    'utf8',
  )
  assert.match(ledgerSwitcherSource, /switcher-trigger/)
  assert.doesNotMatch(ledgerSwitcherSource, /class="select switcher-btn"/)
  assert.match(habitatCssSource, /\[data-ui-layout='modern'\] \.ledger-switcher \.switcher-btn[\s\S]*?background:\s*transparent/)
})

test('home keeps all blocks and FAB under both layouts', () => {
  assert.doesNotMatch(homeSource, /HomeModernView/)
  assert.match(homeSource, /HomeModernOverview/)
  assert.doesNotMatch(homeSource, /HomeAssetSummaryCard/)
  assert.doesNotMatch(homeSource, /HomeBudgetSummaryCard/)
  assert.match(homeSource, /HomeTransactionFeed/)
  assert.match(homeSource, /data-testid="home-period-filter"/)
  assert.match(homeSource, /chrome-test-id="home-period-chrome"/)
  assert.match(homeSource, /data-testid="home-fab"/)
  assert.match(homeSource, /useHomePeriodFilter/)
  assert.match(homeSource, /HabitatPageShell/)
  assert.match(homeSource, /root-class="home-modern"/)
  assert.match(homeSource, /home_page\.habitat_hello/)
  assert.match(homeSource, /hello-test-id="home-hello-block"/)
  assert.match(habitatCssSource, /\[data-ui-layout='modern'\] \.home-modern \.overview-hero/)
  assert.doesNotMatch(homeSource, /HomeCreditSummaryCard/)
  assert.doesNotMatch(homeSource, /useUiLayout/)
  const overviewSource = readFileSync(
    resolve(import.meta.dirname, '../src/ui/components/home/HomeModernOverview.vue'),
    'utf8',
  )
  const budgetAt = overviewSource.indexOf('data-testid="home-budget-summary"')
  const assetAt = overviewSource.indexOf('data-testid="home-asset-summary"')
  assert.ok(budgetAt >= 0 && assetAt >= 0 && budgetAt < assetAt, 'budget hero must render above asset flow')
})

test('router does not register /more page', () => {
  assert.doesNotMatch(routerSource, /path: '\/more'/)
  assert.doesNotMatch(routerSource, /MorePage\.vue/)
})

test('personalization page has traditional/modern layout switch UI', () => {
  assert.match(personalizationSource, /personalization\.ui_layout/)
  assert.match(personalizationSource, /listUiLayouts/)
  assert.match(personalizationSource, /setLayout/)
  assert.match(personalizationSource, /ui-layout-\$\{/)
  assert.match(personalizationSource, /theme-scheme/)
})

test('ui-layout service keeps traditional and modern without forced migration', () => {
  assert.match(layoutServiceSource, /id: 'traditional'/)
  assert.match(layoutServiceSource, /DEFAULT_LAYOUT = 'modern'/)
  assert.match(layoutServiceSource, /normalizeUiLayout/)
  assert.doesNotMatch(layoutServiceSource, /migrates to modern/)
})

test('main.js defers FontAwesome registry instead of statically importing every icon', () => {
  assert.match(mainJsSource, /fa-icon-registry/)
  assert.doesNotMatch(mainJsSource, /@fortawesome\/free-solid-svg-icons/)
  assert.match(iconRegistrySource, /export function registerAppIcons/)
  const iconImport = mainJsSource.indexOf("import('@/ui/utils/fa-icon-registry.js')")
  const mountCall = mainJsSource.indexOf('app.mount(')
  const sqliteCall = mainJsSource.indexOf('await initSqliteWebStoreWithTimeout(')
  assert.equal(iconImport >= 0 && iconImport < mountCall, true, 'icon chunk must start before mount')
  assert.equal(sqliteCall > mountCall, true, 'sqlite init must start after mount, not wait on FA')
})

test('app runtime bootstraps ui layout and habitat css', () => {
  assert.match(appRuntimeSource, /loadUiLayout\(\)/)
  assert.match(mainJsSource, /apple-ui\.css/)
  assert.match(mainJsSource, /habitat-ui\.css/)
  assert.match(habitatCssSource, /\[data-ui-layout='modern'\]/)
  assert.match(appleCssSource, /\[data-ui-layout='traditional'\]/)
  assert.doesNotMatch(habitatCssSource, /backdrop-filter/)
})

test('i18n keeps traditional and modern layout keys', () => {
  assert.match(i18nSource, /'personalization\.ui_layout'/)
  assert.match(i18nSource, /'ui_layout\.traditional\.name': '傳統'/)
  assert.match(i18nSource, /'ui_layout\.modern\.name': '現代'/)
  assert.match(i18nSource, /'ui_layout\.modern\.name': 'Modern'/)
  assert.match(i18nSource, /'ui_layout\.modern\.name': 'モダン'/)
})

test('docs mention dual ui layout', () => {
  assert.match(featuresMapSource, /傳統|modern-only|ui-layout|apple-ui|Habitat|生活色域/u)
  assert.match(detailedDocSource, /傳統|modern-only|apple-ui|Apple HIG|Habitat|生活色域/u)
})

test('playwright asserts dual layout switch and keeps home blocks', () => {
  assert.match(playwrightSource, /data-testid="ui-layout-traditional"/)
  assert.match(playwrightSource, /assertHomeBlocks/)
  assert.match(playwrightSource, /assertHomeIncomeExpenseLightAndDark/)
  assert.match(playwrightSource, /assertFullscreenBookkeepingTopInset/)
  assert.match(playwrightSource, /assertDualUiLayout/)
})

test('useHomePeriodFilter composable exists for shared home filter logic', () => {
  const composablePath = resolve(root, 'src/ui/composables/useHomePeriodFilter.js')
  const composableSource = readFileSync(composablePath, 'utf8')
  assert.match(composableSource, /export function useHomePeriodFilter/)
  assert.match(composableSource, /switchFilterMode/)
  assert.match(homeSource, /useHomePeriodFilter/)
})
