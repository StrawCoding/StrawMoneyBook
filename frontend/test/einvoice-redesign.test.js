import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readI18nBundleSource } from './helpers/i18n-source.js'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('電子發票匯入改用命名階段，不再只顯示無名圓點', () => {
  const source = read('src/ui/views/einvoice/EInvoiceImportWizardPage.vue')

  assert.match(source, /STAGE_KEYS/)
  assert.match(source, /einvoice\.stage1/)
  assert.match(source, /stage-name/)
  assert.doesNotMatch(source, /v-for="n in 4"/)
})

test('電子發票匯入路由改導向載具同步設定頁', () => {
  const router = read('src/ui/router/index.js')

  assert.match(router, /name: 'einvoice-import',[\s\S]*redirect:\s*\{\s*name:\s*'settings-carrier-sync'\s*\}/)
  assert.match(router, /name: 'settings-carrier-sync'/)
  assert.match(router, /SettingsCarrierSyncPage\.vue/)
})

test('電子發票查詢流程具備取消、重試與狀態化錯誤回饋', () => {
  const source = read('src/ui/views/einvoice/EInvoiceStep3Select.vue')

  assert.match(source, /handleCancel/)
  assert.match(source, /handleRetry/)
  assert.match(source, /status_cancelled/)
  assert.match(source, /status_timeout/)
  assert.match(source, /status_failed/)
  assert.match(source, /back_to_query/)
})

test('電子發票 store 使用 generation token 丟棄過期查詢結果並清除下游狀態', () => {
  const source = read('src/ui/stores/einvoice-import.store.js')

  assert.match(source, /scrapeGeneration/)
  assert.match(source, /startScrape/)
  assert.match(source, /commitScrapeResult\(token, list\)/)
  assert.match(source, /scrapeGeneration\.value !== token/)
  assert.match(source, /cancelScrape/)
  assert.match(source, /clearScrapeResults/)
  assert.match(source, /selectedInvoiceNumbers\.value = new Set\(\)/)
})

test('電子發票 store 改用手機條碼與查詢碼欄位，不再使用電話號碼、密碼與舊發票狀態篩選', () => {
  const source = read('src/ui/stores/einvoice-import.store.js')

  assert.match(source, /carrierBarcode/)
  assert.match(source, /verificationCode/)
  assert.doesNotMatch(source, /phoneNumber/)
  assert.doesNotMatch(source, /['"]phone['"]/)
  assert.doesNotMatch(source, /invoiceStatus/)
  assert.doesNotMatch(source, /EINVOICE_STATUS/)
})

test('電子發票 Step1 UI 顯示手機條碼與查詢碼輸入欄位', () => {
  const source = read('src/ui/views/einvoice/EInvoiceStep1Account.vue')

  assert.match(source, /carrier_barcode/)
  assert.match(source, /verification_code/)
  assert.match(source, /carrierBarcode/)
  assert.match(source, /verificationCode/)
  assert.doesNotMatch(source, /phone_placeholder/)
  assert.doesNotMatch(source, /password_placeholder/)
})

test('電子發票 Step1 下一步允許財政部手機條碼可用符號字元', () => {
  const source = read('src/ui/views/einvoice/EInvoiceStep1Account.vue')

  assert.ok(source.includes('[A-Za-z0-9+.\\-]{7}'))
  assert.doesNotMatch(source, /\[A-Za-z0-9\]\{7\}/)
})

test('電子發票 Step1 格式錯誤時顯示行內驗證訊息並修正 normalizeBarcode 空白處理', () => {
  const source = read('src/ui/views/einvoice/EInvoiceStep1Account.vue')

  assert.match(source, /barcodeError/)
  assert.match(source, /codeError/)
  assert.match(source, /einvoice\.step1\.barcode_error/)
  assert.match(source, /einvoice\.step1\.code_error/)
  assert.match(source, /v-if="barcodeError"/)
  assert.match(source, /v-if="codeError"/)
  assert.match(source, /store\.carrierBarcode = val/)
})

test('電子發票 Step1 驗證錯誤與清除儲存載具 i18n 具備繁中、英文、日文三語', () => {
  const source = readI18nBundleSource()
  const keys = [
    'einvoice.step1.barcode_error',
    'einvoice.step1.code_error',
    'einvoice.step1.clear_saved',
    'einvoice.step1.clear_saved_done',
    'einvoice.step1.clear_saved_error',
  ]
  for (const key of keys) {
    const matches = source.match(new RegExp(`'${key.replaceAll('.', '\\.')}':`, 'g')) ?? []
    assert.equal(matches.length, 3, `${key} should exist in zh-TW, en, ja`)
  }
})

test('電子發票 Step1 依技術文檔提供清除已儲存載具資料入口', () => {
  const source = read('src/ui/views/einvoice/EInvoiceStep1Account.vue')

  assert.match(source, /clearEInvoiceCredential/)
  assert.match(source, /hasSavedCredential = ref\(false\)/)
  assert.match(source, /v-if="hasSavedCredential"/)
  assert.match(source, /handleClearSavedCredential/)
  assert.match(source, /einvoice\.step1\.clear_saved/)
  assert.match(source, /einvoice\.step1\.clear_saved_done/)
  assert.match(source, /store\.carrierBarcode = ''/)
  assert.match(source, /store\.verificationCode = ''/)
  assert.match(source, /hasSavedCredential\.value = false/)
})

test('電子發票 Step2 預設查詢區間不超過後端單次查詢上限', () => {
  const source = read('src/ui/views/einvoice/EInvoiceStep2Query.vue')

  assert.match(source, /MAX_QUERY_DAYS = 62/)
  assert.match(source, /from\.setDate\(from\.getDate\(\) - \(MAX_QUERY_DAYS - 1\)\)/)
  assert.match(source, /einvoice\.step2\.range_hint/)
  assert.doesNotMatch(source, /setMonth\(from\.getMonth\(\) - 3\)/)
})

test('電子發票後端服務改用 Playwright scrape API，停用 native WebView 自動化', () => {
  const backendSource = read('src/services/einvoice/backend.js')
  const scrapeApiSource = read('src/services/einvoice/scrape-api.js')
  const nativeSource = read('src/services/einvoice/native-automation.js')
  const packageSource = read('package.json')
  const mainActivity = read('android/app/src/main/java/com/strawcoding/strawmoneybook/MainActivity.java')
  const manifest = read('android/app/src/main/AndroidManifest.xml')

  assert.match(backendSource, /startEInvoiceScrapeSession/)
  assert.match(backendSource, /queryEInvoiceScrapeInvoices/)
  assert.match(scrapeApiSource, /\/api\/einvoice\/scrape\/start/)
  assert.match(scrapeApiSource, /\/api\/einvoice\/scrape\/query/)
  assert.match(scrapeApiSource, /\/api\/einvoice\/query-invoices/)

  assert.match(nativeSource, /return false/)
  assert.match(nativeSource, /Playwright scrape/)
  assert.doesNotMatch(nativeSource, /WebViewActivity\.start/)
  assert.doesNotMatch(nativeSource, /EInvoiceAutomationPlugin\.query/)
  assert.doesNotMatch(mainActivity, /EInvoiceAutomationPlugin/)
  assert.doesNotMatch(manifest, /EInvoiceAutomationActivity/)
  assert.doesNotMatch(packageSource, /simulate:einvoice-login/)
  assert.equal(existsSync(new URL('../android/app/src/main/java/com/strawcoding/strawmoneybook/EInvoiceAutomation.java', import.meta.url)), false)
  assert.equal(existsSync(new URL('../android/app/src/main/java/com/strawcoding/strawmoneybook/EInvoiceAutomationActivity.java', import.meta.url)), false)
  assert.equal(existsSync(new URL('../android/app/src/main/java/com/strawcoding/strawmoneybook/EInvoiceAutomationPlugin.java', import.meta.url)), false)
  assert.equal(existsSync(new URL('../scripts/simulate-einvoice-login-flow.mjs', import.meta.url)), false)
})

test('SMB-258: scrape API maps fetch network errors to einvoice i18n message', () => {
  const scrapeApiSource = read('src/services/einvoice/scrape-api.js')
  const i18nSource = readI18nBundleSource()

  assert.match(scrapeApiSource, /mapFetchNetworkError/)
  assert.match(scrapeApiSource, /Failed to fetch/)
  assert.match(scrapeApiSource, /einvoice\.error\.network_failed/)
  const matches = i18nSource.match(/'einvoice\.error\.network_failed':/g) ?? []
  assert.equal(matches.length, 3, 'einvoice.error.network_failed should exist in zh-TW, en, ja')
})

test('新增電子發票流程文字具備繁中、英文、日文 i18n', () => {
  const source = readI18nBundleSource()
  const keys = [
    'einvoice.stage1',
    'einvoice.stage2',
    'einvoice.stage3',
    'einvoice.stage4',
    'einvoice.step1.carrier_barcode',
    'einvoice.step1.verification_code',
    'einvoice.step2.range_hint',
    'einvoice.step3.cancel',
    'einvoice.step3.retry',
    'einvoice.step3.back_to_query',
    'einvoice.step3.status_cancelled',
    'einvoice.step3.status_timeout',
    'einvoice.step3.status_failed',
  ]

  for (const key of keys) {
    const matches = source.match(new RegExp(`'${key.replaceAll('.', '\\.')}':`, 'g')) ?? []
    assert.equal(matches.length, 3, `${key} should exist in zh-TW, en, ja`)
  }
})

test('電子發票 i18n 已移除舊的 phone/password 及 invoice_status 等欄位', () => {
  const source = readI18nBundleSource()

  assert.doesNotMatch(source, /'einvoice\.step1\.phone':/)
  assert.doesNotMatch(source, /'einvoice\.step1\.password':/)
  assert.doesNotMatch(source, /'einvoice\.step2\.invoice_status':/)
  assert.doesNotMatch(source, /'einvoice\.step3\.status_not_supported':/)
  assert.doesNotMatch(source, /'einvoice\.not_supported_notice':/)
  assert.doesNotMatch(source, /'debug_page\.key\.einvoice_phone':/)
})

test('電子發票 debug trace 使用遮罩手機條碼而非舊手機號碼欄位', () => {
  const debugSource = read('src/core/services/einvoice-debug.service.js')
  const debugPageSource = read('src/ui/views/settings/SettingsDeveloperDebugPage.vue')

  assert.match(debugSource, /maskCarrierBarcode/)
  assert.match(debugSource, /maskedCarrierBarcode/)
  assert.doesNotMatch(debugSource, /maskedPhone/)
  assert.doesNotMatch(debugSource, /meta\.phone/)
  assert.match(debugPageSource, /maskedCarrierBarcode/)
  assert.match(debugPageSource, /debug_page\.key\.einvoice_carrier_barcode/)
  assert.doesNotMatch(debugPageSource, /einvoice_phone/)
})

test('電子發票 Step3 發票列表顯示載具 chip（SMB-226）', () => {
  const source = read('src/ui/views/einvoice/EInvoiceStep3Select.vue')

  assert.match(source, /v-if="inv\.carrierName"/)
  assert.match(source, /carrier-chip/)
  assert.match(source, /einvoice\.step3\.carrier_label/)
})

test('電子發票 Step4 確認頁預覽顯示載具名稱（SMB-226）', () => {
  const source = read('src/ui/views/einvoice/EInvoiceStep4Confirm.vue')

  assert.match(source, /v-if="inv\.carrierName"/)
  assert.match(source, /preview-carrier/)
  assert.match(source, /einvoice\.step3\.carrier_label/)
})
