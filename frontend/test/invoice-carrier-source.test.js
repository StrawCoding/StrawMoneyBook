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

test('invoice carrier create page now uses one-step Android automation instead of manual three-step flow', () => {
  assert.match(createPageSource, /Android 端內全自動流程/)
  assert.match(createPageSource, /不需要再手動輸入圖形驗證碼/)
  assert.match(createPageSource, /secure settings \/ native vault/)
  assert.match(createPageSource, /connectInvoiceCarrier\(/)
  assert.doesNotMatch(createPageSource, /3 段式連線流程/)
  assert.doesNotMatch(createPageSource, /pollInvoiceCarrierSessionStatus/)
  assert.doesNotMatch(createPageSource, /startInvoiceCarrierLinkSession/)
})

test('invoice carrier pages expose Android-only diagnostics and disabled web messaging', () => {
  assert.match(carrierPageSource, /Web 僅提供診斷與說明/)
  assert.match(createPageSource, /請改用 Android App 執行新增或重新驗證/)
  assert.match(connectionPageSource, /需使用 Android App/)
  assert.match(connectionPageSource, /自動化受阻/)
})

test('invoice carrier ui service and backend adapter use Android-only connect flow', () => {
  assert.match(uiServiceSource, /connectInvoiceCarrierBackend/)
  assert.match(uiServiceSource, /credentialState/)
  assert.match(backendAdapterSource, /connectNativeInvoiceCarrier/)
  assert.match(backendAdapterSource, /invoice_carrier_android_required/)
  assert.match(backendAdapterSource, /Web 版僅提供診斷與說明/)
  assert.match(backendAdapterSource, /isNativeInvoiceCarrierAutomationRuntimeSupported/)
  assert.doesNotMatch(backendAdapterSource, /https:\/\/api\.strawmb\.com/)
  assert.doesNotMatch(backendAdapterSource, /session_status/)
})

test('invoice carrier Android native automation is registered around connect/sync/disconnect actions', () => {
  assert.match(androidMainActivitySource, /registerPlugin\(InvoiceCarrierAutomationPlugin\.class\)/)
  assert.match(androidManifestSource, /InvoiceCarrierAutomationActivity/)
  assert.match(nativeAdapterSource, /registerPlugin\('InvoiceCarrierAutomation'\)/)
  assert.match(nativeAdapterSource, /connectNativeInvoiceCarrier/)
  assert.match(androidPluginSource, /public void connect\(PluginCall call\)/)
  assert.match(androidActivitySource, /ACTION_CONNECT/)
  assert.match(androidAutomationSource, /authenticateSession/)
  assert.match(androidAutomationSource, /invoice_carrier_captcha_failed/)
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
  assert.match(featuresMapSource, /Android 優先的端內全自動流程/)
  assert.match(featuresMapSource, /Web 僅提供診斷與說明/)
  assert.match(detailedDocSource, /Android App 會直接在原生 WebView 內完成登入、驗證碼辨識、查詢與同步/)
  assert.match(detailedDocSource, /Web 版只保留設定入口、診斷與說明/)
  assert.match(detailedDocSource, /automation_blocked/)
})
