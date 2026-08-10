import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const featureListSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/FeatureListPage.vue'),
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
const featuresMapSource = readFileSync(
  resolve(import.meta.dirname, '../StrawMoneyBook_Features_Map.md'),
  'utf8',
)
const detailedDocSource = readFileSync(
  resolve(import.meta.dirname, '../../StrawMoneyBook_App_Features_Detailed.md'),
  'utf8',
)

test('feature list exposes securities entry in general section', () => {
  assert.match(featureListSource, /to: '\/assets\/securities'/)
  assert.match(featureListSource, /feature_list\.securities/)
  assert.match(featureListSource, /feature-link-securities/)
  assert.match(featureListSource, /fa-solid fa-chart-line/)
  assert.match(i18nSource, /'feature_list\.securities': '有價證券'/)
  assert.match(i18nSource, /'feature_list\.securities': 'Securities'/)
  assert.match(i18nSource, /'feature_list\.securities': '有価証券'/)
  assert.match(featuresMapSource, /有價證券：`\/assets\/securities`/)
  assert.match(detailedDocSource, /一般功能含預算項目[\s\S]*有價證券/)
})

test('feature list exposes budget items with an icon', () => {
  assert.match(featureListSource, /to: '\/budget'/)
  assert.match(featureListSource, /feature_list\.budget_items/)
  assert.match(featureListSource, /fa-solid fa-chart-pie/)
  assert.match(i18nSource, /'feature_list\.budget_items': '預算項目'/)
})

test('feature list docs include the budget items entry', () => {
  assert.match(featuresMapSource, /功能列表導覽[\s\S]*預算項目：`\/budget`/)
  assert.match(detailedDocSource, /功能列表分為「一般功能」與「進階功能」/)
})

test('smb295: feature list advanced section hosts four sync entries', () => {
  assert.match(featureListSource, /feature_list\.advanced/)
  assert.match(featureListSource, /data-testid="feature-list-advanced"/)
  assert.match(featureListSource, /to: '\/settings\/shared-ledgers'/)
  assert.match(featureListSource, /to: '\/settings\/google-drive-ledger-sync'/)
  assert.match(featureListSource, /to: '\/settings\/bank-sync'/)
  assert.match(featureListSource, /to: '\/settings\/carrier-sync'/)
  assert.match(featureListSource, /isBankSyncFeatureEnabled/)
  assert.match(featureListSource, /feature_list\.shared_ledgers/)
  assert.match(featureListSource, /feature_list\.carrier_sync/)
  assert.match(i18nSource, /'feature_list\.advanced': '進階功能'/)
  assert.match(i18nSource, /'feature_list\.shared_ledgers': '共同帳本'/)
  assert.match(i18nSource, /'feature_list\.bank_sync': '銀行同步'/)
  assert.match(i18nSource, /'feature_list\.carrier_sync': '載具同步'/)
  assert.match(i18nSource, /'feature_list\.advanced': 'Advanced'/)
  assert.match(i18nSource, /'feature_list\.advanced': '高度な機能'/)
})

test('smb299: advanced section also exposes Drive appData select/revision restore', () => {
  assert.match(featureListSource, /feature-link-drive-appdata-restore/)
  assert.match(featureListSource, /feature_list\.drive_appdata_restore/)
  assert.match(featureListSource, /#drive-appdata-browser/)
  assert.match(i18nSource, /'feature_list\.drive_appdata_restore': 'Drive 備份選檔／舊版還原'/)
})

test('smb295: settings main list no longer lists the four sync entries', () => {
  assert.doesNotMatch(settingsSource, /to: '\/settings\/shared-ledgers'/)
  assert.doesNotMatch(settingsSource, /to: '\/settings\/google-drive-ledger-sync'/)
  assert.doesNotMatch(settingsSource, /to: '\/settings\/bank-sync'/)
  assert.doesNotMatch(settingsSource, /to: '\/settings\/carrier-sync'/)
  assert.doesNotMatch(settingsSource, /isBankSyncFeatureEnabled/)
  assert.match(settingsSource, /to: '\/settings\/ledgers'/)
  assert.match(settingsSource, /to: '\/settings\/auto-backup'/)
})

test('smb295: docs record advanced section and settings cleanup', () => {
  assert.match(featuresMapSource, /進階功能（`feature_list\.advanced`）/)
  assert.match(featuresMapSource, /共同帳本：`\/settings\/shared-ledgers`/)
  assert.match(featuresMapSource, /不再\*\*列於設定頁主清單/)
  assert.match(detailedDocSource, /進階功能（`feature_list\.advanced`）含共同帳本/)
})
