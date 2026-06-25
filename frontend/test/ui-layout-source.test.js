import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

const bottomNavSource = readFileSync(resolve(root, 'src/ui/components/layout/BottomNav.vue'), 'utf8')
const homeSource = readFileSync(resolve(root, 'src/ui/views/home.vue'), 'utf8')
const personalizationSource = readFileSync(resolve(root, 'src/ui/views/settings/SettingsPersonalizationPage.vue'), 'utf8')
const routerSource = readFileSync(resolve(root, 'src/ui/router/index.js'), 'utf8')
const i18nSource = readFileSync(resolve(root, 'src/ui/services/i18n.service.js'), 'utf8')
const appRuntimeSource = readFileSync(resolve(root, 'src/ui/services/app-runtime.service.js'), 'utf8')
const featuresMapSource = readFileSync(resolve(root, 'StrawMoneyBook_Features_Map.md'), 'utf8')
const detailedDocSource = readFileSync(resolve(import.meta.dirname, '../../StrawMoneyBook_App_Features_Detailed.md'), 'utf8')

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
})

test('docs mention ui layout phase 1 surfaces', () => {
  assert.match(featuresMapSource, /介面風格|ui-layout|更多頁/u)
  assert.match(detailedDocSource, /介面風格|現代版|更多頁/u)
})
