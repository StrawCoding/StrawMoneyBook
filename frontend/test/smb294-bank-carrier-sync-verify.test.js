import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildBankSyncAvailabilityAssessment } from '../src/services/bank-sync/availability-core.js'
import { buildNativeVaultLookupIds } from '../src/services/bank-sync/shared.js'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('smb294: native vault lookup passes distinct local + provider ids', () => {
  const ids = buildNativeVaultLookupIds({
    id: 'local-db-id',
    provider_connection_id: 'first_bank_identity_abc',
  })
  assert.equal(ids.connectionId, 'first_bank_identity_abc')
  assert.equal(ids.connection_id, 'local-db-id')
  assert.equal(ids.provider_connection_id, 'first_bank_identity_abc')
  assert.equal(ids.local_connection_id, 'local-db-id')
  assert.notEqual(ids.connectionId, ids.connection_id)
})

test('smb294: sync/disconnect use buildNativeVaultLookupIds (not identical dual keys)', () => {
  const service = read('src/ui/services/bank-sync.service.js')
  const shared = read('src/services/bank-sync/shared.js')
  assert.match(shared, /export function buildNativeVaultLookupIds/)
  assert.match(service, /buildNativeVaultLookupIds/)
  assert.match(service, /\.\.\.vaultIds/)
  const syncBlock = service.slice(service.indexOf('export async function syncBankConnectionNow'))
  assert.doesNotMatch(
    syncBlock.slice(0, 2500),
    /connectionId:\s*nativeVaultConnectionId,\s*\n\s*connection_id:\s*nativeVaultConnectionId/,
  )
})

test('smb294: Android resolveVaultConnectionId tries provider + local candidates', () => {
  const automation = read('android/app/src/main/java/com/strawcoding/strawmoneybook/FirstBankAutomation.java')
  assert.match(automation, /resolveVaultConnectionId/)
  assert.match(automation, /provider_connection_id/)
  assert.match(automation, /local_connection_id/)
  assert.match(automation, /LinkedHashSet/)
})

test('smb294: web bank availability still prefers android_only over credentials_missing', () => {
  const result = buildBankSyncAvailabilityAssessment({
    membershipOk: true,
    featureEnabled: true,
    androidRuntime: false,
    nativeAutomationAvailable: false,
    apiConfigured: false,
    hasCredentials: false,
  })
  assert.equal(result.errorCode, 'bank_sync_android_only')
  assert.doesNotMatch(JSON.stringify(result.stages), /bank_sync_credentials_missing/)
})

test('smb294: carrier availability source keeps membership → api → credentials order', () => {
  const availability = read('src/services/einvoice/availability.js')
  assert.match(availability, /id: 'membership'/)
  assert.match(availability, /id: 'api'/)
  assert.match(availability, /id: 'credentials'/)
  assert.match(availability, /carrier_sync_membership_required/)
  assert.match(availability, /recovery: 'membership'/)
  const membershipIdx = availability.indexOf("id: 'membership'")
  const apiIdx = availability.indexOf("id: 'api'")
  const credsIdx = availability.indexOf("id: 'credentials'")
  assert.ok(membershipIdx < apiIdx && apiIdx < credsIdx)
})

test('smb294: playwright scripts cover error-code branching + seeded review', () => {
  const carrier = read('scripts/playwright-carrier-sync-settings.mjs')
  const bank = read('scripts/playwright-bank-sync-settings.mjs')
  assert.match(carrier, /__SMB_PLAYWRIGHT_CARRIER_SYNC__|straw\.playwright\.hooks/)
  assert.match(bank, /__SMB_PLAYWRIGHT_BANK_SYNC__|straw\.playwright\.hooks/)
  assert.match(carrier, /carrier_sync_membership_required/)
  assert.match(carrier, /seedMembershipAndPendingReview/)
  assert.match(carrier, /carrier-sync-review/)
  assert.match(carrier, /button:has-text\('Next'\), button:has-text\('下一步'\)/)
  assert.match(bank, /bank_sync_android_only|bank_sync_membership_required/)
  assert.match(bank, /seedMembershipAndPendingConnection/)
  assert.match(bank, /must not silently redirect/)
  assert.match(bank, /feature-link-bank-sync/)
  assert.match(bank, /bank-sync-debug-toggle/)
  assert.match(bank, /button:has-text\('Next'\), button:has-text\('下一步'\)/)
})

test('smb294: review panels expose data-testid hooks', () => {
  const carrierPage = read('src/ui/views/settings/SettingsCarrierSyncPage.vue')
  const bankPage = read('src/ui/views/settings/SettingsBankSyncPage.vue')
  const bankConn = read('src/ui/views/settings/SettingsBankSyncConnectionPage.vue')
  assert.match(carrierPage, /data-testid="carrier-sync-review"/)
  assert.match(carrierPage, /__SMB_PLAYWRIGHT_CARRIER_SYNC__/)
  assert.match(bankPage, /__SMB_PLAYWRIGHT_BANK_SYNC__/)
  assert.match(bankConn, /data-testid="bank-sync-review"/)
})
