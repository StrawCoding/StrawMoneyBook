import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readI18nBundleSource } from './helpers/i18n-source.js'

const root = resolve(import.meta.dirname, '..')
const mainJsSource = readFileSync(resolve(root, 'src/main.js'), 'utf8')

const bottomNavSource = readFileSync(resolve(root, 'src/ui/components/layout/BottomNav.vue'), 'utf8')
const homeSource = readFileSync(resolve(root, 'src/ui/views/home.vue'), 'utf8')
const personalizationSource = readFileSync(resolve(root, 'src/ui/views/settings/SettingsPersonalizationPage.vue'), 'utf8')
const routerSource = readFileSync(resolve(root, 'src/ui/router/index.js'), 'utf8')
const layoutServiceSource = readFileSync(resolve(root, 'src/ui/services/ui-layout.service.js'), 'utf8')
const i18nSource = readI18nBundleSource()
const appRuntimeSource = readFileSync(resolve(root, 'src/ui/services/app-runtime.service.js'), 'utf8')
const featuresMapSource = readFileSync(resolve(root, 'StrawMoneyBook_Features_Map.md'), 'utf8')
const detailedDocSource = readFileSync(resolve(import.meta.dirname, '../../StrawMoneyBook_App_Features_Detailed.md'), 'utf8')
const playwrightSource = readFileSync(resolve(root, 'scripts/playwright-ui-layout.mjs'), 'utf8')

const UI_LAYOUT_ICON_FILES = [
  resolve(root, 'src/ui/components/layout/BottomNav.vue'),
  resolve(root, 'src/ui/views/home.vue'),
  resolve(root, 'src/ui/views/settings/SettingsPersonalizationPage.vue'),
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
  const iconsArrayBlock = source.match(/const icons = \[([\s\S]*?)\]/)?.[1] ?? ''
  const names = new Set()
  for (const match of `${importBlock}\n${iconsArrayBlock}`.matchAll(/\b(fa[A-Z][A-Za-z0-9]*)\b/g)) {
    names.add(match[1])
  }
  return names
}

const registeredIcons = collectRegisteredIconImports(mainJsSource)

test('ui-layout surfaces only use FontAwesome icons registered in main.js', () => {
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

test('bottom nav keeps 5 tabs in modern-only layout (no /more or 4-tab CTA)', () => {
  assert.doesNotMatch(bottomNavSource, /MODERN_NAV_ITEMS/)
  assert.doesNotMatch(bottomNavSource, /to: '\/more'/)
  assert.doesNotMatch(bottomNavSource, /isCta: true/)
  assert.match(bottomNavSource, /fa-solid fa-grip/)
  assert.match(bottomNavSource, /to: '\/features'/)
  assert.match(bottomNavSource, /useUiLayout/)
})

test('home keeps all blocks and FAB under modern-only layout', () => {
  assert.doesNotMatch(homeSource, /HomeModernView/)
  assert.match(homeSource, /HomeAssetSummaryCard/)
  assert.match(homeSource, /HomeBudgetSummaryCard/)
  assert.match(homeSource, /HomeTransactionFeed/)
  assert.match(homeSource, /data-testid="home-period-filter"/)
  assert.match(homeSource, /data-testid="home-fab"/)
  assert.match(homeSource, /useHomePeriodFilter/)
  assert.match(homeSource, /useUiLayout/)
})

test('router does not register /more page', () => {
  assert.doesNotMatch(routerSource, /path: '\/more'/)
  assert.doesNotMatch(routerSource, /MorePage\.vue/)
})

test('personalization page has no traditional/modern layout switch UI', () => {
  assert.doesNotMatch(personalizationSource, /personalization\.ui_layout/)
  assert.doesNotMatch(personalizationSource, /listUiLayouts/)
  assert.doesNotMatch(personalizationSource, /saveUiLayout/)
  assert.doesNotMatch(personalizationSource, /pickLayout/)
  assert.doesNotMatch(personalizationSource, /ui-layout-\$\{/)
  assert.doesNotMatch(personalizationSource, /data-testid="ui-layout-/)
  assert.match(personalizationSource, /theme-scheme/)
})

test('ui-layout service is modern-only with traditional migration', () => {
  assert.match(layoutServiceSource, /migrateStoredLayout|traditional/)
  assert.match(layoutServiceSource, /DEFAULT_LAYOUT = 'modern'/)
  assert.doesNotMatch(layoutServiceSource, /id: 'traditional'/)
  assert.match(layoutServiceSource, /return DEFAULT_LAYOUT/)
})

test('app runtime bootstraps ui layout', () => {
  assert.match(appRuntimeSource, /loadUiLayout\(\)/)
  assert.match(mainJsSource, /apple-ui\.css/)
})

test('i18n keeps modern layout keys and drops traditional switch copy', () => {
  assert.doesNotMatch(i18nSource, /'personalization\.ui_layout'/)
  assert.doesNotMatch(i18nSource, /'ui_layout\.traditional\.name'/)
  assert.match(i18nSource, /'ui_layout\.modern\.name': '現代'/)
  assert.match(i18nSource, /'ui_layout\.modern\.name': 'Modern'/)
  assert.match(i18nSource, /'ui_layout\.modern\.name': 'モダン'/)
})

test('docs mention modern-only ui layout', () => {
  assert.match(featuresMapSource, /只保留現代|modern-only|ui-layout|apple-ui/u)
  assert.match(detailedDocSource, /只保留現代|modern-only|apple-ui|Apple HIG/u)
})

test('playwright asserts modern-only layout without traditional switch', () => {
  assert.doesNotMatch(playwrightSource, /click',\s*'\[data-testid="ui-layout-traditional"\]'/)
  assert.doesNotMatch(playwrightSource, /assertLayoutSwitch/)
  assert.match(playwrightSource, /assertModernLayoutOnly/)
  assert.match(playwrightSource, /assertHomeBlocks/)
  assert.match(playwrightSource, /assertHomeIncomeExpenseLightAndDark/)
  assert.match(playwrightSource, /traditional.*migrate|migrate.*modern|localStorage\.setItem\('strawmoneybook\.ui\.layout', 'traditional'\)/u)
})

test('useHomePeriodFilter composable exists for shared home filter logic', () => {
  const composablePath = resolve(root, 'src/ui/composables/useHomePeriodFilter.js')
  const composableSource = readFileSync(composablePath, 'utf8')
  assert.match(composableSource, /export function useHomePeriodFilter/)
  assert.match(composableSource, /switchFilterMode/)
  assert.match(homeSource, /useHomePeriodFilter/)
})
