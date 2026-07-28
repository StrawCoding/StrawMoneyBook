import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildBankSyncAvailabilityAssessment } from '../src/services/bank-sync/availability-core.js'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('SMB-280: scrape health probe sends cookie-auth headers with credentials include', () => {
  const scrape = read('src/services/einvoice/scrape-api.js')
  assert.match(scrape, /function buildEInvoiceRequestHeaders/)
  assert.match(scrape, /function getEInvoiceCredentialsMode/)
  assert.match(scrape, /probeEInvoiceApiHealth/)
  const healthBlock = scrape.slice(scrape.indexOf('export async function probeEInvoiceApiHealth'))
  assert.match(healthBlock, /buildEInvoiceRequestHeaders\(\)/)
  assert.match(healthBlock, /credentials:\s*getEInvoiceCredentialsMode\(\)/)
  assert.match(scrape, /einvoice_network_failed/)
  assert.match(scrape, /einvoice_query_timeout/)
})

test('SMB-280: backend credentialed CORS treats Cookie / native client as credentialed', () => {
  const http = readFileSync(resolve(root, '../backend/src/collab/http.js'), 'utf8')
  assert.match(http, /function wantsCredentialedCors\(req\)/)
  assert.match(http, /x-straw-native-client/)
  assert.match(http, /headers\?\.cookie/)
  assert.match(http, /einvoice_network_failed/)
})

test('SMB-280: bank credentials stage never fires on non-Android runtime', () => {
  const result = buildBankSyncAvailabilityAssessment({
    membershipOk: true,
    hasCredentials: false,
    featureEnabled: true,
    androidRuntime: false,
    nativeAutomationAvailable: false,
    apiConfigured: false,
  })
  assert.equal(result.errorCode, 'bank_sync_android_only')
  assert.equal(result.recoveryCta, 'get_android_app')
  const credentials = result.stages.find((stage) => stage.id === 'credentials')
  assert.ok(credentials)
  assert.equal(credentials.ok, true)
  assert.equal(credentials.code, null)
  assert.doesNotMatch(JSON.stringify(result.stages), /bank_sync_credentials_missing/)
})

test('SMB-280: Android native without connection surfaces bank_sync_credentials_missing + open_create', () => {
  const result = buildBankSyncAvailabilityAssessment({
    membershipOk: true,
    hasCredentials: false,
    featureEnabled: true,
    androidRuntime: true,
    nativeAutomationAvailable: true,
    apiConfigured: true,
  })
  assert.equal(result.errorCode, 'bank_sync_credentials_missing')
  assert.equal(result.recoveryCta, 'open_create')
  const credentials = result.stages.find((stage) => stage.id === 'credentials')
  assert.equal(credentials.ok, false)
  assert.equal(credentials.code, 'bank_sync_credentials_missing')
})

test('SMB-280: connection with legacy vault miss stays on credentials stage (not false missing after create)', () => {
  const result = buildBankSyncAvailabilityAssessment({
    membershipOk: true,
    hasCredentials: true,
    credentialsInvalid: true,
    lastErrorCode: 'first_bank_legacy_reconnect_required: First Bank native credentials are missing',
    featureEnabled: true,
    androidRuntime: true,
    nativeAutomationAvailable: true,
    apiConfigured: true,
    lastSyncStatus: 'error',
  })
  assert.equal(result.errorCode, 'first_bank_legacy_reconnect_required')
  assert.equal(result.recoveryCta, 'reconnect')
  const credentials = result.stages.find((stage) => stage.id === 'credentials')
  assert.equal(credentials.ok, false)
  const sync = result.stages.find((stage) => stage.id === 'sync')
  assert.equal(sync.ok, true)
  assert.equal(sync.code, null)
})

test('SMB-280: after credentials exist and sync idle, availability is ready', () => {
  const result = buildBankSyncAvailabilityAssessment({
    membershipOk: true,
    hasCredentials: true,
    featureEnabled: true,
    androidRuntime: true,
    nativeAutomationAvailable: true,
    apiConfigured: true,
    lastSyncStatus: 'ok',
  })
  assert.equal(result.errorCode, null)
  assert.equal(result.ready, true)
})

test('SMB-280: native vault uses provider_connection_id and commit()', () => {
  const service = read('src/ui/services/bank-sync.service.js')
  const shared = read('src/services/bank-sync/shared.js')
  const vault = read('android/app/src/main/java/com/strawcoding/strawmoneybook/BankAutomationVault.java')
  const automation = read('android/app/src/main/java/com/strawcoding/strawmoneybook/FirstBankAutomation.java')
  assert.match(shared, /buildNativeVaultLookupIds/)
  assert.match(service, /buildNativeVaultLookupIds/)
  assert.match(service, /provider_connection_id/)
  assert.match(vault, /\.commit\(\)/)
  assert.doesNotMatch(vault, /\.apply\(\)/)
  assert.match(automation, /resolveVaultConnectionId|payload\.optString\("connection_id"\)/)
  assert.match(automation, /first_bank_legacy_reconnect_required/)
})

test('SMB-280: carrier lastError preserves error code for availability', () => {
  const service = read('src/services/einvoice/carrier-sync.service.js')
  const page = read('src/ui/views/settings/SettingsCarrierSyncPage.vue')
  assert.match(service, /\$\{errorCode\}: \$\{errorMessage\}/)
  assert.match(page, /extractCarrierErrorCode/)
})
