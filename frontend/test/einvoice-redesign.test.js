import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('電子發票匯入改用命名階段，不再只顯示無名圓點', () => {
  const source = read('src/ui/views/einvoice/EInvoiceImportWizardPage.vue')

  assert.match(source, /STAGE_KEYS/)
  assert.match(source, /einvoice\.stage1/)
  assert.match(source, /stage-name/)
  assert.doesNotMatch(source, /v-for="n in 4"/)
})

test('電子發票匯入使用全螢幕流程，避免底部導覽覆蓋內容', () => {
  const router = read('src/ui/router/index.js')
  const app = read('src/ui/App.vue')

  assert.match(router, /name: 'einvoice-import',[\s\S]*hideAppChrome: true/)
  assert.match(app, /const hideAppChrome = computed/)
  assert.match(app, /<BottomNav v-if="hasLedgers && !isBooting && !showGuidedFlow && !hideAppChrome"/)
  assert.match(app, /full-screen-route/)
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

test('電子發票 Step1 驗證錯誤 i18n 具備繁中、英文、日文三語', () => {
  const source = read('src/ui/services/i18n.service.js')
  const keys = ['einvoice.step1.barcode_error', 'einvoice.step1.code_error']
  for (const key of keys) {
    const matches = source.match(new RegExp(`'${key.replaceAll('.', '\\.')}':`, 'g')) ?? []
    assert.equal(matches.length, 3, `${key} should exist in zh-TW, en, ja`)
  }
})

test('電子發票 Step2 預設查詢區間不超過後端單次查詢上限', () => {
  const source = read('src/ui/views/einvoice/EInvoiceStep2Query.vue')

  assert.match(source, /MAX_QUERY_DAYS = 62/)
  assert.match(source, /from\.setDate\(from\.getDate\(\) - \(MAX_QUERY_DAYS - 1\)\)/)
  assert.match(source, /einvoice\.step2\.range_hint/)
  assert.doesNotMatch(source, /setMonth\(from\.getMonth\(\) - 3\)/)
})

test('電子發票後端服務改用 HTTP API，停用 native WebView 自動化', () => {
  const backendSource = read('src/services/einvoice/backend.js')
  const nativeSource = read('src/services/einvoice/native-automation.js')
  const packageSource = read('package.json')
  const mainActivity = read('android/app/src/main/java/com/strawcoding/strawmoneybook/MainActivity.java')
  const manifest = read('android/app/src/main/AndroidManifest.xml')

  // backend uses HTTP fetch to API
  assert.match(backendSource, /fetch\(url/)
  assert.match(backendSource, /\/api\/einvoice\/query-invoices/)
  assert.match(backendSource, /cardNo/)
  assert.match(backendSource, /cardEncrypt/)

  // native automation is a no-op stub
  assert.match(nativeSource, /return false/)
  assert.match(nativeSource, /disabled/)
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

test('新增電子發票流程文字具備繁中、英文、日文 i18n', () => {
  const source = read('src/ui/services/i18n.service.js')
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
  const source = read('src/ui/services/i18n.service.js')

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
