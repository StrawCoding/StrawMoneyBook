import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const mainJsSource = readFileSync(resolve(root, 'src/main.js'), 'utf8')

const bottomNavSource = readFileSync(resolve(root, 'src/ui/components/layout/BottomNav.vue'), 'utf8')
const homeSource = readFileSync(resolve(root, 'src/ui/views/home.vue'), 'utf8')
const personalizationSource = readFileSync(resolve(root, 'src/ui/views/settings/SettingsPersonalizationPage.vue'), 'utf8')
const routerSource = readFileSync(resolve(root, 'src/ui/router/index.js'), 'utf8')
const i18nSource = readFileSync(resolve(root, 'src/ui/services/i18n.service.js'), 'utf8')
const jaSource = readFileSync(resolve(root, 'src/ui/services/runtime-ja-messages.generated.js'), 'utf8')
const appRuntimeSource = readFileSync(resolve(root, 'src/ui/services/app-runtime.service.js'), 'utf8')
const appVueSource = readFileSync(resolve(root, 'src/ui/App.vue'), 'utf8')
const appleUiCssSource = readFileSync(resolve(root, 'src/ui/assets/css/apple-ui.css'), 'utf8')
const featuresMapSource = readFileSync(resolve(root, 'StrawMoneyBook_Features_Map.md'), 'utf8')
const detailedDocSource = readFileSync(resolve(import.meta.dirname, '../../StrawMoneyBook_App_Features_Detailed.md'), 'utf8')

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

test('bottom nav keeps 5 tabs in both layouts (no /more or 4-tab CTA)', () => {
  assert.doesNotMatch(bottomNavSource, /MODERN_NAV_ITEMS/)
  assert.doesNotMatch(bottomNavSource, /to: '\/more'/)
  assert.doesNotMatch(bottomNavSource, /isCta: true/)
  assert.match(bottomNavSource, /fa-solid fa-grip/)
  assert.match(bottomNavSource, /to: '\/features'/)
  assert.match(bottomNavSource, /useUiLayout/)
})

test('home keeps all traditional blocks and FAB for both layouts', () => {
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

test('personalization page exposes interface style picker', () => {
  assert.match(personalizationSource, /personalization\.ui_layout/)
  assert.match(personalizationSource, /saveUiLayout/)
  assert.match(personalizationSource, /pickLayout\(layoutId\)[\s\S]*saveUiLayout\(layoutId\)/)
  assert.match(personalizationSource, /data-testid="`ui-layout-\$\{layoutOption\.id\}`"|ui-layout-\$\{layoutOption\.id\}/)
})

test('app runtime bootstraps ui layout', () => {
  assert.match(appRuntimeSource, /loadUiLayout\(\)/)
  assert.match(mainJsSource, /apple-ui\.css/)
})

test('i18n includes ui layout keys in zh-TW, en, ja', () => {
  assert.match(i18nSource, /'personalization\.ui_layout': '介面風格'/)
  assert.match(i18nSource, /'ui_layout\.modern\.name': '現代'/)
  assert.match(i18nSource, /'personalization\.ui_layout': 'Interface style'/)
  assert.match(i18nSource, /'ui_layout\.modern\.name': 'モダン'/)
  assert.match(jaSource, /"personalization\.ui_layout": "画面スタイル"/)
})

test('docs mention ui layout phase 1 surfaces', () => {
  assert.match(featuresMapSource, /介面風格|ui-layout|apple-ui/u)
  assert.match(detailedDocSource, /介面風格|現代|apple-ui/u)
})

test('modern shell hides duplicate top bar in App.vue', () => {
  assert.match(appVueSource, /modern-shell/)
  assert.match(appVueSource, /showTopBar/)
  assert.match(appVueSource, /useUiLayout/)
})

test('apple-ui.css includes phase 2 flat shell overrides', () => {
  assert.match(appleUiCssSource, /Phase 2/)
  assert.match(appleUiCssSource, /modern-shell/)
  assert.match(appleUiCssSource, /backdrop-filter: none/)
  assert.match(appleUiCssSource, /data-testid='home-fab'/)
})

test('useHomePeriodFilter composable exists for shared home filter logic', () => {
  const composablePath = resolve(root, 'src/ui/composables/useHomePeriodFilter.js')
  const composableSource = readFileSync(composablePath, 'utf8')
  assert.match(composableSource, /export function useHomePeriodFilter/)
  assert.match(composableSource, /switchFilterMode/)
  assert.match(homeSource, /useHomePeriodFilter/)
})
