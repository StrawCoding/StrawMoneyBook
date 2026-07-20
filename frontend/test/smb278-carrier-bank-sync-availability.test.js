import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('SMB-278: bank sync feature visibility is not native-gated', () => {
  const source = read('src/services/bank-sync/backend.js')
  assert.match(source, /export function isBankSyncFeatureEnabled\(\)/)
  assert.match(source, /return BANK_SYNC_FEATURE_ENABLED/)
  assert.match(source, /export function isBankSyncNativeAutomationAvailable\(\)/)
  assert.match(source, /export function getBankSyncSupportMatrix\(\)/)
  const exposeFn = source.match(/function shouldExposeProvider\([\s\S]*?\n\}/)
  assert.ok(exposeFn, 'shouldExposeProvider must exist')
  assert.doesNotMatch(exposeFn[0], /isNativeBankAutomationRuntimeSupported/)
})

test('SMB-278: bank sync availability helper exposes diagnostic stages', () => {
  const source = read('src/services/bank-sync/availability.js')
  const core = read('src/services/bank-sync/availability-core.js')
  assert.match(source, /export function assessBankSyncAvailability/)
  assert.match(core, /membership/)
  assert.match(core, /platform/)
  assert.match(core, /bank_sync_android_only/)
  assert.match(core, /recoveryCta/)
})

test('SMB-278: bank sync settings page shows support matrix instead of silent redirect', () => {
  const page = read('src/ui/views/settings/SettingsBankSyncPage.vue')
  const router = read('src/ui/router/index.js')
  assert.match(page, /data-testid="bank-sync-availability"/)
  assert.match(page, /data-testid="bank-sync-support-matrix"/)
  assert.match(page, /data-testid="bank-sync-recovery-cta"/)
  assert.match(page, /assessBankSyncAvailability/)
  assert.match(router, /isBankSyncFeatureEnabled\(\)/)
})

test('SMB-278: carrier sync availability + captcha refresh', () => {
  const page = read('src/ui/views/settings/SettingsCarrierSyncPage.vue')
  const service = read('src/services/einvoice/carrier-sync.service.js')
  const availability = read('src/services/einvoice/availability.js')
  const scrape = read('src/services/einvoice/scrape-api.js')
  assert.match(page, /data-testid="carrier-sync-availability"/)
  assert.match(page, /data-testid="carrier-sync-recovery-cta"/)
  assert.match(page, /refreshCaptchaImage/)
  assert.match(page, /captcha\.refresh/)
  assert.match(page, /captcha\.expired/)
  assert.match(service, /export async function refreshCarrierCaptchaSession/)
  assert.match(availability, /assessCarrierSyncAvailability/)
  assert.match(scrape, /probeEInvoiceApiHealth/)
  assert.match(scrape, /health_ok_does_not_mean_portal_login_ok/)
})

test('SMB-278: bank sync read paths do not assert/navigate free users away', () => {
  const service = read('src/ui/services/bank-sync.service.js')
  assert.match(service, /export async function getBankSyncState/)
  assert.match(service, /hasBankSyncMembershipAccess/)
  assert.match(service, /if \(!\(await dependencies\.hasBankSyncMembershipAccess\(\)\)\) return \[\]/)
  assert.match(service, /if \(!\(await dependencies\.hasBankSyncMembershipAccess\(\)\)\) return null/)
})

test('SMB-278: package.json restores playwright:carrier-sync', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.scripts['playwright:carrier-sync'], 'node scripts/playwright-carrier-sync-settings.mjs')
  assert.equal(pkg.scripts['playwright:bank-sync'], 'node scripts/playwright-bank-sync-settings.mjs')
})

test('SMB-278: playwright scripts require app-shell BottomNav and real routes', () => {
  const carrier = read('scripts/playwright-carrier-sync-settings.mjs')
  const bank = read('scripts/playwright-bank-sync-settings.mjs')
  assert.match(carrier, /\/settings\/carrier-sync/)
  assert.match(carrier, /bottom-nav/)
  assert.match(carrier, /completeOnboarding/)
  assert.match(carrier, /carrier-sync-availability/)
  assert.match(bank, /\/settings\/bank-sync/)
  assert.match(bank, /bottom-nav/)
  assert.match(bank, /bank-sync-support-matrix/)
  assert.match(bank, /must not silently redirect/)
})
