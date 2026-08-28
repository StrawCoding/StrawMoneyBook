import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const carrierActivitySource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/CarrierAutomationActivity.java',
)
const carrierPluginSource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/CarrierAutomationPlugin.java',
)
const natGovSource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/NatGovEInvoiceAutomation.java',
)
const captchaSolverSource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/core/CarrierSyncContract.java',
)
const providerRegistrySource = read('src/services/einvoice/provider-registry.js')
const nativeAutomationSource = read('src/services/einvoice/native-automation.js')
const orchestratorSource = read('src/services/einvoice/carrier-sync-orchestrator.js')
const carrierServiceSource = read('src/services/einvoice/carrier-sync.service.js')
const availabilitySource = read('src/services/einvoice/availability.js')
const mainActivitySource = read('android/app/src/main/java/com/strawcoding/strawmoneybook/MainActivity.java')
const manifestSource = read('android/app/src/main/AndroidManifest.xml')

test('carrier automation activity registers modular provider dispatch', () => {
  assert.match(carrierActivitySource, /CarrierAutomationActivity/)
  assert.match(carrierActivitySource, /DESKTOP_VIEWPORT_WIDTH = 1280/)
  assert.match(carrierActivitySource, /NatGovEInvoiceAutomation/)
  assert.match(carrierActivitySource, /abortRunningSession/)
  assert.match(carrierActivitySource, /einvoice_captcha_required/)
})

test('carrier automation plugin exposes Architecture B methods', () => {
  assert.match(carrierPluginSource, /CarrierAutomationPlugin/)
  assert.match(carrierPluginSource, /connectCarrier/)
  assert.match(carrierPluginSource, /syncCarrier/)
  assert.match(carrierPluginSource, /disconnectCarrier/)
  assert.match(carrierPluginSource, /submitCaptcha/)
  assert.match(carrierPluginSource, /abortCarrier/)
})

test('nat gov provider uses shared CaptchaSolver validateCaptchaCandidate', () => {
  assert.match(natGovSource, /CaptchaSolver/)
  assert.match(natGovSource, /validateCaptchaCandidate/)
  assert.match(natGovSource, /nat_gov_einvoice_tw/)
  assert.match(natGovSource, /observe_only/)
  assert.match(natGovSource, /INTERCEPT_SKIP_REASON_POST/)
})

test('provider registry lists nat_gov_einvoice_tw only', () => {
  assert.match(providerRegistrySource, /nat_gov_einvoice_tw/)
  assert.match(providerRegistrySource, /listRegisteredCarrierProviders/)
})

test('native automation enables Android runtime and CarrierAutomation plugin', () => {
  assert.match(nativeAutomationSource, /isCarrierAutomationRuntimeSupported/)
  assert.match(nativeAutomationSource, /registerPlugin\('CarrierAutomation'\)/)
  assert.match(nativeAutomationSource, /connectNativeCarrier/)
  assert.match(nativeAutomationSource, /syncNativeCarrier/)
})

test('carrier sync service routes through orchestrator not scrape-api on Android', () => {
  assert.match(carrierServiceSource, /fetchCarrierInvoices/)
  assert.match(carrierServiceSource, /resolveCarrierSyncBackend/)
  assert.match(carrierServiceSource, /cancelCarrierSyncBackendSession/)
  assert.doesNotMatch(carrierServiceSource, /startEInvoiceScrapeSession/)
  assert.match(orchestratorSource, /resolveCarrierSyncBackend/)
  assert.match(orchestratorSource, /fetchCarrierInvoicesNativeRoute/)
  assert.match(orchestratorSource, /fetchCarrierInvoicesScrapeRoute/)
})

test('availability checks Android runtime stage', () => {
  assert.match(availabilitySource, /isCarrierAutomationRuntimeSupported/)
  assert.match(availabilitySource, /id: 'runtime'/)
  assert.match(availabilitySource, /android_native_runtime_authoritative/)
})

test('main activity and manifest register carrier automation', () => {
  assert.match(mainActivitySource, /CarrierAutomationPlugin/)
  assert.match(manifestSource, /CarrierAutomationActivity/)
})

test('carrier sync contract defines lookback + query api detection', () => {
  assert.match(captchaSolverSource, /readLookbackDays/)
  assert.match(captchaSolverSource, /isQueryApiUrl/)
  assert.match(captchaSolverSource, /shouldReplayInterceptRequest/)
})

test('jvm carrier provider and captcha tests exist', () => {
  const providerTest = read('android/app/src/test/java/com/strawcoding/strawmoneybook/NatGovEInvoiceAutomationTest.java')
  const contractTest = read('android/app/src/test/java/com/strawcoding/strawmoneybook/core/CarrierSyncContractTest.java')
  const captchaTest = read('android/app/src/test/java/com/strawcoding/strawmoneybook/core/CaptchaSolverTest.java')
  assert.match(providerTest, /NatGovEInvoiceAutomationTest/)
  assert.match(providerTest, /fixtureSyncReturnsNormalizedInvoices/)
  assert.match(contractTest, /CarrierSyncContractTest/)
  assert.match(captchaTest, /validateCaptchaCandidate/)
})
