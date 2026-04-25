import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const settingsSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/settings.vue'), 'utf8')
const featureListSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/FeatureListPage.vue'), 'utf8')
const mainSource = readFileSync(resolve(import.meta.dirname, '../src/main.js'), 'utf8')
const carrierPageSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/settings/SettingsInvoiceCarrierPage.vue'), 'utf8')
const createPageSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/settings/SettingsInvoiceCarrierCreatePage.vue'), 'utf8')
const connectionPageSource = readFileSync(resolve(import.meta.dirname, '../src/ui/views/settings/SettingsInvoiceCarrierConnectionPage.vue'), 'utf8')
const backendAdapterSource = readFileSync(resolve(import.meta.dirname, '../src/services/invoice-carrier/backend.js'), 'utf8')
const uiServiceSource = readFileSync(resolve(import.meta.dirname, '../src/ui/services/invoice-carrier.service.js'), 'utf8')
const nativeAdapterSource = readFileSync(resolve(import.meta.dirname, '../src/services/invoice-carrier/native-automation.js'), 'utf8')
const androidMainActivitySource = readFileSync(resolve(import.meta.dirname, '../android/app/src/main/java/com/strawcoding/strawmoneybook/MainActivity.java'), 'utf8')
const androidManifestSource = readFileSync(resolve(import.meta.dirname, '../android/app/src/main/AndroidManifest.xml'), 'utf8')
const androidPluginSource = readFileSync(resolve(import.meta.dirname, '../android/app/src/main/java/com/strawcoding/strawmoneybook/InvoiceCarrierAutomationPlugin.java'), 'utf8')
const androidActivitySource = readFileSync(resolve(import.meta.dirname, '../android/app/src/main/java/com/strawcoding/strawmoneybook/InvoiceCarrierAutomationActivity.java'), 'utf8')
const androidAutomationSource = readFileSync(resolve(import.meta.dirname, '../android/app/src/main/java/com/strawcoding/strawmoneybook/InvoiceCarrierAutomation.java'), 'utf8')
const googleDriveSyncSource = readFileSync(resolve(import.meta.dirname, '../src/ui/services/google-drive-ledger-sync.service.js'), 'utf8')
const sharedLedgerServiceSource = readFileSync(resolve(import.meta.dirname, '../src/ui/services/shared-ledger.service.js'), 'utf8')
const featuresMapSource = readFileSync(resolve(import.meta.dirname, '../StrawMoneyBook_Features_Map.md'), 'utf8')
const detailedDocSource = readFileSync(resolve(import.meta.dirname, '../../StrawMoneyBook_App_Features_Detailed.md'), 'utf8')

test('settings and feature list expose invoice carrier as a public experimental entry', () => {
  assert.match(settingsSource, /電子發票載具（實驗性）/)
  assert.match(featureListSource, /電子發票載具（實驗性）/)
  assert.match(mainSource, /faFileInvoice/)
})

test('invoice carrier create page now uses Android manual captcha flow inside the app', () => {
  assert.match(createPageSource, /Android 端內登入流程/)
  assert.match(createPageSource, /驗證碼改由你手動輸入/)
  assert.match(createPageSource, /secure settings \/ native vault/)
  assert.match(createPageSource, /startInvoiceCarrierLinkSession\(/)
  assert.match(createPageSource, /completeInvoiceCarrierLinkSession\(/)
  assert.match(createPageSource, /captcha_image/)
  assert.match(createPageSource, /重新產生驗證碼/)
  assert.doesNotMatch(createPageSource, /不需要再手動輸入圖形驗證碼/)
})

test('invoice carrier pages expose Android-only diagnostics and disabled web messaging', () => {
  assert.match(carrierPageSource, /Web 僅提供診斷與說明/)
  assert.match(createPageSource, /請改用 Android App 執行新增或重新驗證/)
  assert.match(connectionPageSource, /需使用 Android App/)
  assert.match(connectionPageSource, /自動化受阻/)
})

test('invoice carrier ui service and backend adapter use Android-only native session flow', () => {
  assert.match(uiServiceSource, /createInvoiceCarrierLinkSessionBackend/)
  assert.match(uiServiceSource, /exchangeInvoiceCarrierAuthBackend/)
  assert.match(uiServiceSource, /getInvoiceCarrierSessionStatusBackend/)
  assert.match(uiServiceSource, /credentialState/)
  assert.doesNotMatch(uiServiceSource, /connectInvoiceCarrierBackend/)
  assert.doesNotMatch(backendAdapterSource, /connectNativeInvoiceCarrier\(/)
  assert.match(backendAdapterSource, /createNativeInvoiceCarrierLinkSession/)
  assert.match(backendAdapterSource, /getNativeInvoiceCarrierSessionStatus/)
  assert.match(backendAdapterSource, /exchangeNativeInvoiceCarrierAuth/)
  assert.match(backendAdapterSource, /invoice_carrier_android_required/)
  assert.match(backendAdapterSource, /Web 版僅提供診斷與說明/)
  assert.match(backendAdapterSource, /isNativeInvoiceCarrierAutomationRuntimeSupported/)
  assert.doesNotMatch(backendAdapterSource, /https:\/\/api\.strawmb\.com/)
})

test('invoice carrier Android native automation is registered around manual captcha session/sync/disconnect actions', () => {
  assert.match(androidMainActivitySource, /registerPlugin\(InvoiceCarrierAutomationPlugin\.class\)/)
  assert.match(androidManifestSource, /InvoiceCarrierAutomationActivity/)
  assert.match(nativeAdapterSource, /registerPlugin\('InvoiceCarrierAutomation'\)/)
  assert.doesNotMatch(nativeAdapterSource, /export async function connectNativeInvoiceCarrier/)
  assert.match(nativeAdapterSource, /createNativeInvoiceCarrierLinkSession/)
  assert.match(nativeAdapterSource, /exchangeNativeInvoiceCarrierAuth/)
  assert.doesNotMatch(androidPluginSource, /public void connect\(PluginCall call\)/)
  assert.match(androidPluginSource, /public void createLinkSession\(PluginCall call\)/)
  assert.doesNotMatch(androidActivitySource, /ACTION_CONNECT/)
  assert.match(androidActivitySource, /setAlpha\(0\.01f\)/)
  assert.match(androidAutomationSource, /buildSessionPayload/)
  assert.match(androidAutomationSource, /manual_reauth_required/)
  assert.doesNotMatch(androidAutomationSource, /captcha_ocr_attempt/)
  assert.match(androidAutomationSource, /invoice_carrier_automation_blocked/)
  assert.match(androidAutomationSource, /provider_connection_id/)
})

test('local-only invoice credentials are excluded from Google Drive and shared-ledger snapshots', () => {
  assert.match(googleDriveSyncSource, /isLocalOnlyAppSettingKey/)
  assert.match(googleDriveSyncSource, /appSettings\.filter\(\(row\) => !isLocalOnlyAppSettingKey\(row\?\.key\)\)/)
  assert.match(sharedLedgerServiceSource, /isLocalOnlyAppSettingKey/)
  assert.match(sharedLedgerServiceSource, /appSettings\.filter\(\(row\) => !isLocalOnlyAppSettingKey\(row\?\.key\)\)/)
})

test('invoice carrier docs describe Android-first automation and web diagnostics mode', () => {
  assert.match(featuresMapSource, /Android 端內人工 captcha 流程/)
  assert.match(featuresMapSource, /Web 僅提供診斷與說明/)
  assert.match(detailedDocSource, /Android App 會先在原生 WebView 內載入登入頁與圖形驗證碼/)
  assert.match(detailedDocSource, /Web 版只保留設定入口、診斷與說明/)
  assert.match(detailedDocSource, /Node \/ Web headed Playwright、OCR 與 `\/api\/invoice\/\*` 舊流程已移除/)
  assert.match(detailedDocSource, /automation_blocked/)
})
