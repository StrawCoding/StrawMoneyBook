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
const nativeAdapterSource = readFileSync(resolve(import.meta.dirname, '../src/services/invoice-carrier/native-automation.js'), 'utf8')
const androidMainActivitySource = readFileSync(resolve(import.meta.dirname, '../android/app/src/main/java/com/strawcoding/strawmoneybook/MainActivity.java'), 'utf8')
const androidManifestSource = readFileSync(resolve(import.meta.dirname, '../android/app/src/main/AndroidManifest.xml'), 'utf8')
const androidPluginSource = readFileSync(resolve(import.meta.dirname, '../android/app/src/main/java/com/strawcoding/strawmoneybook/InvoiceCarrierAutomationPlugin.java'), 'utf8')
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

test('invoice carrier create page implements the three-step Cloudflare flow', () => {
  assert.match(createPageSource, /3 段式連線流程/)
  assert.match(createPageSource, /Cloudflare 安全驗證/)
  assert.match(createPageSource, /secure settings/)
  assert.match(createPageSource, /pollInvoiceCarrierSessionStatus/)
  assert.match(createPageSource, /startInvoiceCarrierLinkSession/)
  assert.match(createPageSource, /isInvoiceCarrierLinkingSupported/)
  assert.doesNotMatch(createPageSource, /手機端暫不支援新增載具/)
})

test('invoice carrier create page avoids automatic status polling on Android native sessions', () => {
  assert.match(createPageSource, /isNativeInvoiceCarrierAutomationRuntimeSupported/)
  assert.match(backendAdapterSource, /export \{ isNativeInvoiceCarrierAutomationRuntimeSupported \}/)
  assert.match(createPageSource, /const shouldAutoPollSessionStatus = computed\(\(\) => !isNativeInvoiceCarrierAutomationRuntimeSupported\(\)\)/)
  assert.match(createPageSource, /if \(!shouldAutoPollSessionStatus\.value\) return/)
})

test('invoice carrier add entry always opens the create diagnostics page', () => {
  assert.match(carrierPageSource, /:to="\{ name: 'settings-invoice-carrier-create' \}"/)
  assert.doesNotMatch(carrierPageSource, /pointer-events:\s*none/)
  assert.doesNotMatch(carrierPageSource, /name:\s*'settings-invoice-carrier'\s*\}/)
})

test('invoice carrier connection page exposes reauth CTA and carrier filter syncing by connection id', () => {
  assert.match(connectionPageSource, /重新驗證載具/)
  assert.match(connectionPageSource, /載具篩選/)
  assert.match(connectionPageSource, /store\.syncConnection\(ledgerStore\.activeLedgerId, connectionId\.value/)
  assert.match(connectionPageSource, /略過重複\/未變更/)
})

test('invoice carrier backend adapter uses session_status and unavailable messaging', () => {
  assert.match(backendAdapterSource, /\/api\/invoice\/session_status/)
  assert.match(backendAdapterSource, /api_unavailable_web/)
  assert.match(backendAdapterSource, /api_unavailable_native/)
  assert.match(backendAdapterSource, /VITE_INVOICE_CARRIER_API_BASE_URL/)
  assert.match(backendAdapterSource, /https:\/\/api\.strawmb\.com/)
  assert.match(backendAdapterSource, /native_linking_unavailable/)
  assert.match(backendAdapterSource, /isNativeInvoiceCarrierAutomationRuntimeSupported/)
  assert.match(nativeAdapterSource, /registerPlugin\('InvoiceCarrierAutomation'\)/)
  assert.doesNotMatch(backendAdapterSource, /VITE_SHARED_LEDGER_API_BASE_URL/)
  assert.match(backendAdapterSource, /VITE_BANK_SYNC_CLIENT_SHARED_KEY/)
})

test('invoice carrier Android native automation is registered and exposes compatible actions', () => {
  assert.match(androidMainActivitySource, /registerPlugin\(InvoiceCarrierAutomationPlugin\.class\)/)
  assert.match(androidManifestSource, /InvoiceCarrierAutomationActivity/)
  assert.match(androidPluginSource, /createLinkSession/)
  assert.match(androidPluginSource, /getSessionStatus/)
  assert.match(androidPluginSource, /exchangeAuth/)
  assert.match(androidPluginSource, /sync/)
  assert.match(androidAutomationSource, /https:\/\/www\.einvoice\.nat\.gov\.tw\/accounts\/login/)
  assert.match(androidAutomationSource, /provider_connection_id/)
  assert.match(androidAutomationSource, /storage_state/)
  assert.match(androidAutomationSource, /invoice_carrier_reauth_required/)
})

test('local-only invoice credentials are excluded from Google Drive and shared-ledger snapshots', () => {
  assert.match(googleDriveSyncSource, /isLocalOnlyAppSettingKey/)
  assert.match(googleDriveSyncSource, /appSettings\.filter\(\(row\) => !isLocalOnlyAppSettingKey\(row\?\.key\)\)/)
  assert.match(sharedLedgerServiceSource, /isLocalOnlyAppSettingKey/)
  assert.match(sharedLedgerServiceSource, /appSettings\.filter\(\(row\) => !isLocalOnlyAppSettingKey\(row\?\.key\)\)/)
})

test('invoice carrier docs describe the feature as public experimental instead of hidden', () => {
  assert.match(featuresMapSource, /電子發票載具（公開但標示為實驗性；Web 首次需在 headed browser 完成 Cloudflare 驗證，Android 以原生 WebView 自動化完成新增與同步/)
  assert.doesNotMatch(featuresMapSource, /\/settings\/invoice-carrier.*暫時隱藏/)
  assert.match(detailedDocSource, /功能已公開，但明確標示為「實驗性」/)
  assert.match(detailedDocSource, /Android App 使用原生 WebView 自動化/)
  assert.match(detailedDocSource, /reauth_required/)
  assert.match(detailedDocSource, /Google Drive 帳本同步，也不會進 shared-ledger snapshot/)
})
