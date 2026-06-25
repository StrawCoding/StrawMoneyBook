import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const mainJsSource = readFileSync(resolve(root, 'src/main.js'), 'utf8')

const bottomNavSource = readFileSync(resolve(root, 'src/ui/components/layout/BottomNav.vue'), 'utf8')
const homeModernSource = readFileSync(resolve(root, 'src/ui/components/home/HomeModernView.vue'), 'utf8')
const homeSource = readFileSync(resolve(root, 'src/ui/views/home.vue'), 'utf8')
const morePageSource = readFileSync(resolve(root, 'src/ui/views/MorePage.vue'), 'utf8')
const personalizationSource = readFileSync(resolve(root, 'src/ui/views/settings/SettingsPersonalizationPage.vue'), 'utf8')
const routerSource = readFileSync(resolve(root, 'src/ui/router/index.js'), 'utf8')
const i18nSource = readFileSync(resolve(root, 'src/ui/services/i18n.service.js'), 'utf8')
const appRuntimeSource = readFileSync(resolve(root, 'src/ui/services/app-runtime.service.js'), 'utf8')
const featuresMapSource = readFileSync(resolve(root, 'StrawMoneyBook_Features_Map.md'), 'utf8')
const detailedDocSource = readFileSync(resolve(import.meta.dirname, '../../StrawMoneyBook_App_Features_Detailed.md'), 'utf8')

const UI_LAYOUT_ICON_FILES = [
  resolve(root, 'src/ui/components/layout/BottomNav.vue'),
  resolve(root, 'src/ui/components/home/HomeModernView.vue'),
  resolve(root, 'src/ui/views/MorePage.vue'),
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

test('modern bottom nav uses 4 tabs plus center bookkeeping CTA', () => {
  assert.match(bottomNavSource, /MODERN_NAV_ITEMS/)
  assert.match(bottomNavSource, /isCta: true/)
  assert.match(bottomNavSource, /to: '\/more'/)
  assert.match(bottomNavSource, /TRADITIONAL_NAV_ITEMS/)
  assert.match(bottomNavSource, /to: '\/features'/)
})

test('home switches between modern and traditional layouts', () => {
  assert.match(homeSource, /HomeModernView v-if="isModern"/)
  assert.match(homeSource, /class="fab btn primary"/)
})

test('modern home retains traditional functional blocks', () => {
  assert.match(homeModernSource, /period-tabs/)
  assert.match(homeModernSource, /HomeRangePicker/)
  assert.match(homeModernSource, /HomeAssetSummaryCard/)
  assert.match(homeModernSource, /HomeBudgetSummaryCard/)
  assert.match(homeModernSource, /HomeTransactionFeed/)
  assert.match(homeModernSource, /data-testid="home-modern-hero"/)
  assert.match(homeModernSource, /fa-solid fa-arrow-right-arrow-left/)
})

test('more page modules cover feature list google drive sync entry', () => {
  assert.match(morePageSource, /to: '\/settings\/google-drive-ledger-sync'/)
  assert.match(morePageSource, /more_page\.module\.google_drive_sync/)
})

test('personalization page exposes interface style picker', () => {
  assert.match(personalizationSource, /personalization\.ui_layout/)
  assert.match(personalizationSource, /saveUiLayout/)
  assert.match(personalizationSource, /pickLayout\(layoutId\)[\s\S]*saveUiLayout\(layoutId\)/)
  assert.match(personalizationSource, /data-testid="`ui-layout-\$\{layoutOption\.id\}`"|ui-layout-\$\{layoutOption\.id\}/)
})

test('router registers more page and bootstraps ui layout', () => {
  assert.match(routerSource, /path: '\/more'/)
  assert.match(routerSource, /MorePage\.vue/)
  assert.match(appRuntimeSource, /loadUiLayout\(\)/)
})

test('i18n includes ui layout and modern home keys in zh-TW', () => {
  assert.match(i18nSource, /'personalization\.ui_layout': '介面風格'/)
  assert.match(i18nSource, /'home_modern\.disposable_balance': '本月可支配餘額'/)
  assert.match(i18nSource, /'nav\.more': '更多'/)
  assert.match(i18nSource, /'more_page\.module\.google_drive_sync': '帳本同步'/)
})

test('docs mention ui layout phase 1 surfaces', () => {
  assert.match(featuresMapSource, /介面風格|ui-layout|更多頁/u)
  assert.match(detailedDocSource, /介面風格|現代版|更多頁/u)
})

test('useHomePeriodFilter composable exists for shared home filter logic', () => {
  const composablePath = resolve(root, 'src/ui/composables/useHomePeriodFilter.js')
  const composableSource = readFileSync(composablePath, 'utf8')
  assert.match(composableSource, /export function useHomePeriodFilter/)
  assert.match(composableSource, /switchFilterMode/)
  assert.match(homeModernSource, /useHomePeriodFilter/)
})
