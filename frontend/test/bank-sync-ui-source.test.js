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

const debugPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsDeveloperDebugPage.vue'),
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
  assert.match(createPageSource, /hua_nan_captcha_manual_required/)
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

test('bank sync pages expose debug-mode web correction-period hint', () => {
  assert.match(listPageSource, /web_debug_hint/)
  assert.match(listPageSource, /bank-sync-debug-web-hint/)
  assert.match(createPageSource, /web_debug_hint/)
  assert.match(createPageSource, /isBankSyncDebugEnabled/)
})

test('developer debug page can toggle bank sync console logging for web', () => {
  assert.match(debugPageSource, /bank-sync-debug-toggle/)
  assert.match(debugPageSource, /bank-sync-console-log/)
  assert.match(debugPageSource, /setBankSyncDebugEnabled/)
  assert.match(debugPageSource, /subscribeBankSyncConsoleLog/)
})

test('playwright bank-sync drives formal product UI via data-testid (no runFormal* shortcuts)', () => {
  const playwrightSource = readFileSync(
    resolve(import.meta.dirname, '../scripts/playwright-bank-sync-settings.mjs'),
    'utf8',
  )
  assert.doesNotMatch(playwrightSource, /runFormalConnect|runFormalSaveMappingAndSync|runFormalImport/)
  assert.match(playwrightSource, /\[data-testid=bank-sync-provider-hua_nan_bank_tw\]/)
  assert.match(playwrightSource, /\[data-testid=bank-sync-field-nationalId\]/)
  assert.match(playwrightSource, /\[data-testid=bank-sync-save-accounts\]/)
  assert.match(playwrightSource, /\[data-testid=bank-sync-sync-now\]/)
  assert.match(playwrightSource, /\[data-testid=bank-sync-review-select-all\]/)
  assert.match(playwrightSource, /\[data-testid=bank-sync-review-import\]/)
  assert.match(playwrightSource, /hasFirstBank/)
  // Dedicated preview port + refuse-free gate (avoid attaching to foreign/stale vite on 4176).
  assert.match(playwrightSource, /BANK_SYNC_PLAYWRIGHT_PORT \|\| 4226/)
  assert.doesNotMatch(playwrightSource, /BANK_SYNC_PLAYWRIGHT_PORT \|\| 4176/)
  assert.match(playwrightSource, /assertPreviewPortFree/)
  assert.match(playwrightSource, /stopPreviewProcess/)
  assert.match(playwrightSource, /settings\/bank-sync\/new/)
  // Web has no WebView: native-boundary fixtures are allowed; UI clicks must still exercise service/DB.
  assert.match(createPageSource, /setBankSyncServiceDependenciesForTest/)
  assert.match(createPageSource, /exchangeBankAuth:\s*async/)
  assert.match(createPageSource, /syncBankTransactions:\s*async/)
  assert.match(createPageSource, /data-testid="bank-sync-account-mapping"/)
  assert.match(createPageSource, /computed\(\(\) => isBankSyncApiConfigured\(\)\)/)
  assert.match(connectionPageSource, /data-testid="bank-sync-sync-now"/)
  assert.match(connectionPageSource, /data-testid="bank-sync-review-import"/)
})
