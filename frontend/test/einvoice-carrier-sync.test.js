import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

test('carrier-sync service 串接 scrape API 與 pending 佇列', () => {
  const source = read('src/services/einvoice/carrier-sync.service.js')
  assert.match(source, /syncCarrierInvoicesNow/)
  assert.match(source, /dedupeInvoices/)
  assert.match(source, /importPendingCarrierInvoices/)
  assert.match(source, /maybeAutoSyncCarrierInvoices/)
  assert.match(source, /runCarrierSyncAutoRefreshInBackground/)
  assert.match(source, /startEInvoiceScrapeSession/)
})

test('載具同步設定頁具備 review panel 與 captcha dialog', () => {
  const source = read('src/ui/views/settings/SettingsCarrierSyncPage.vue')
  assert.match(source, /review-panel/)
  assert.match(source, /showCaptchaDialog/)
  assert.match(source, /syncCarrierInvoicesNow/)
  assert.match(source, /importPendingCarrierInvoices/)
})

test('設定選單與功能列表導向載具同步頁', () => {
  const settings = read('src/ui/views/settings.vue')
  const features = read('src/ui/views/FeatureListPage.vue')
  const router = read('src/ui/router/index.js')

  assert.match(settings, /\/settings\/carrier-sync/)
  assert.match(features, /\/settings\/carrier-sync/)
  assert.match(router, /settings-carrier-sync/)
})

test('載具同步 i18n 具備繁中、英文、日文三語', () => {
  const source = read('src/ui/services/i18n.service.js')
  const keys = [
    'settings_carrier_sync.title',
    'settings_carrier_sync.review.title',
    'settings_carrier_sync.captcha.title',
    'settings_carrier_sync.auto_sync',
  ]

  for (const key of keys) {
    const matches = source.match(new RegExp(`'${key.replaceAll('.', '\\.')}':`, 'g')) ?? []
    assert.equal(matches.length, 3, `${key} should exist in zh-TW, en, ja`)
  }
})
