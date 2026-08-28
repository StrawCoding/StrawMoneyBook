import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readI18nBundleSource } from './helpers/i18n-source.js'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('載具同步 migration 建立 config / pending / sync_runs 三表', () => {
  const sql = read('src/core/db/migrations/037_einvoice_carrier_sync.sql')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS einvoice_sync_config/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS einvoice_pending_invoices/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS einvoice_sync_runs/)
})

test('載具同步 repo 提供 pending 去重與狀態更新方法', () => {
  const source = read('src/core/repositories/einvoice-sync.repo.js')
  assert.match(source, /insertPendingEInvoiceInvoices/)
  assert.match(source, /listDismissedInvoiceNumbers/)
  assert.match(source, /markPendingInvoicesStatus/)
  assert.match(source, /INSERT OR IGNORE/)
})

test('carrier-sync service 串接 orchestrator 與 pending 佇列', () => {
  const source = read('src/services/einvoice/carrier-sync.service.js')
  assert.match(source, /syncCarrierInvoicesNow/)
  assert.match(source, /dedupeInvoices/)
  assert.match(source, /importPendingCarrierInvoices/)
  assert.match(source, /maybeAutoSyncCarrierInvoices/)
  assert.match(source, /runCarrierSyncAutoRefreshInBackground/)
  assert.match(source, /fetchCarrierInvoices/)
  assert.match(source, /resolveCarrierSyncBackend/)
})

test('載具同步設定頁使用手機號碼與密碼欄位', () => {
  const source = read('src/ui/views/settings/SettingsCarrierSyncPage.vue')
  assert.match(source, /carrierPhone/)
  assert.match(source, /carrierPassword/)
  assert.match(source, /settings_carrier_sync\.phone/)
  assert.match(source, /isValidCarrierPhone/)
})

test('載具同步設定頁具備 review panel 與 captcha dialog', () => {
  const source = read('src/ui/views/settings/SettingsCarrierSyncPage.vue')
  assert.match(source, /review-panel/)
  assert.match(source, /showCaptchaDialog/)
  assert.match(source, /syncCarrierInvoicesNow/)
  assert.match(source, /importPendingCarrierInvoices/)
})

test('SMB-265: captcha dialog close and unmount cancel backend scrape session', () => {
  const source = read('src/ui/views/settings/SettingsCarrierSyncPage.vue')
  assert.match(source, /cancelCarrierSyncSession/)
  assert.match(source, /async function closeCaptchaDialog\(\)/)
  assert.match(source, /await cancelCarrierSyncSession\(sessionId\)\.catch\(\(\) => null\)/)
  assert.match(source, /onBeforeUnmount\(\(\) => \{/)
  assert.match(source, /void cancelCarrierSyncSession\(sessionId\)\.catch\(\(\) => null\)/)
})

test('SMB-265: captcha-required state is not overwritten as generic error', () => {
  const source = read('src/services/einvoice/carrier-sync.service.js')
  assert.match(source, /if \(error\?\.code === 'einvoice_captcha_required'\)/)
  assert.match(source, /status:\s*'captcha_required'/)
  assert.match(source, /lastSyncStatus:\s*'captcha_required'/)
  assert.match(source, /lastError:\s*null/)
})

test('SMB-265: scrape API sends existing auth session with e-invoice requests', () => {
  const orchestrator = read('src/services/einvoice/carrier-sync-orchestrator.js')
  const source = read('src/services/einvoice/scrape-api.js')
  assert.match(orchestrator, /fetchCarrierInvoicesScrapeRoute/)
  assert.match(source, /refreshSharedLedgerSession/)
  assert.match(source, /getSharedLedgerSession/)
  assert.match(source, /getAuthStorageHeaders/)
  assert.match(source, /headers\.Authorization = `Bearer \$\{token\}`/)
  assert.match(source, /credentials:\s*getEInvoiceCredentialsMode\(\)/)
  assert.match(source, /getEInvoiceCredentialsMode\(\)[\s\S]*shouldSendAuthCredentials\(\) \? 'include' : 'same-origin'/)
})

test('SMB-265: legacy barcode credentials prompt re-entry instead of silent reuse', () => {
  const pageSource = read('src/ui/views/settings/SettingsCarrierSyncPage.vue')
  const i18nSource = readI18nBundleSource()
  assert.match(pageSource, /!isValidCarrierPhone\(saved\.carrierBarcode\)/)
  assert.match(pageSource, /settings_carrier_sync\.legacy_credentials_reenter/)
  assert.match(i18nSource, /settings_carrier_sync\.legacy_credentials_reenter/)
})

test('功能列表導向載具同步頁；設定頁主清單不再列載具同步', () => {
  const settings = read('src/ui/views/settings.vue')
  const features = read('src/ui/views/FeatureListPage.vue')
  const router = read('src/ui/router/index.js')

  assert.doesNotMatch(settings, /\/settings\/carrier-sync/)
  assert.match(features, /\/settings\/carrier-sync/)
  assert.match(features, /feature_list\.carrier_sync|feature-link-carrier-sync/)
  assert.match(router, /settings-carrier-sync/)
})

test('SMB-307: carrier import uses valid origin_type for transactions table CHECK', () => {
  const source = read('src/services/einvoice/backend.js')
  assert.match(source, /originType:\s*'import'/)
  assert.match(source, /externalRefId:\s*`einvoice:\$\{invoice\.invoiceNumber\}`/)
  assert.doesNotMatch(source, /originType:\s*'einvoice'/)
})

test('載具同步 i18n 具備繁中、英文、日文三語', () => {
  const source = readI18nBundleSource()
  const keys = [
    'settings_carrier_sync.title',
    'settings_carrier_sync.review.title',
    'settings_carrier_sync.captcha.title',
    'settings_carrier_sync.auto_sync',
    'settings_carrier_sync.legacy_credentials_reenter',
  ]

  for (const key of keys) {
    const matches = source.match(new RegExp(`'${key.replaceAll('.', '\\.')}':`, 'g')) ?? []
    assert.equal(matches.length, 3, `${key} should exist in zh-TW, en, ja`)
  }
})
