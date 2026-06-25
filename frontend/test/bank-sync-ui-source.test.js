import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const createPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsBankSyncCreatePage.vue'),
  'utf8',
)

const listPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsBankSyncPage.vue'),
  'utf8',
)

const connectionPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsBankSyncConnectionPage.vue'),
  'utf8',
)

test('bank sync create page uses wizard steps and batch account mapping', () => {
  assert.match(createPageSource, /currentStep/)
  assert.match(createPageSource, /settings_bank_sync_create\.wizard\.step1_title/)
  assert.match(createPageSource, /saveBankAccountsSettings/)
  assert.match(createPageSource, /syncBankConnectionNow/)
  assert.doesNotMatch(createPageSource, /mock_hint/)
})

test('bank sync create page supports manual captcha fallback', () => {
  assert.match(createPageSource, /showCaptchaPanel/)
  assert.match(createPageSource, /first_bank_captcha_manual_required/)
  assert.match(createPageSource, /form\.captchaCode/)
})

test('bank sync list page shows pending review badge and deprecated mock banner', () => {
  assert.match(listPageSource, /pendingReviewCount/)
  assert.match(listPageSource, /settings_bank_sync\.summary\.pending_review/)
  assert.match(listPageSource, /settings_bank_sync\.deprecated_mock_title/)
  assert.doesNotMatch(listPageSource, /sandbox_only/)
})

test('bank sync connection page supports save all and advanced accordion', () => {
  assert.match(connectionPageSource, /saveAllAccounts/)
  assert.match(connectionPageSource, /settings_bank_sync\.account_sync\.save_all/)
  assert.match(connectionPageSource, /showAdvancedSettings/)
  assert.match(connectionPageSource, /settings_bank_sync\.account_sync\.mapping_banner/)
})

test('bank sync connection page supports bank statement csv import fallback', () => {
  assert.match(connectionPageSource, /importBankStatementCsv/)
  assert.match(connectionPageSource, /settings_bank_sync\.csv_import\.title/)
  assert.match(connectionPageSource, /onImportCsvFile/)
})
