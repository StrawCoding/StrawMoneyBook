import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('SMB-278: bank sync product surface restored in advanced section', () => {
  const featureList = read('src/ui/views/FeatureListPage.vue')
  const router = read('src/ui/router/index.js')
  const pkg = JSON.parse(read('package.json'))
  assert.match(featureList, /feature-link-bank-sync/)
  assert.match(featureList, /isBankSyncFeatureEnabled/)
  assert.match(router, /SettingsBankSyncPage/)
  assert.match(router, /path: '\/settings\/bank-sync'/)
  assert.doesNotMatch(router, /redirect: '\/features'/)
  assert.equal(pkg.scripts['playwright:bank-sync'], 'node scripts/playwright-bank-sync-settings.mjs')
})

test('SMB-278: carrier sync availability + captcha refresh', () => {
  const page = read('src/ui/views/settings/SettingsCarrierSyncPage.vue')
  const service = read('src/services/einvoice/carrier-sync.service.js')
  const availability = read('src/services/einvoice/availability.js')
  const orchestrator = read('src/services/einvoice/carrier-sync-orchestrator.js')
  assert.match(page, /data-testid="carrier-sync-availability"/)
  assert.match(page, /data-testid="carrier-sync-recovery-cta"/)
  assert.match(page, /refreshCaptchaImage/)
  assert.match(page, /captcha\.refresh/)
  assert.match(page, /captcha\.expired/)
  assert.match(page, /isCarrierSyncPlatformReady/)
  assert.match(service, /export async function refreshCarrierCaptchaSession/)
  assert.match(availability, /assessCarrierSyncAvailability/)
  assert.match(availability, /isCarrierAutomationRuntimeSupported/)
  assert.match(orchestrator, /refreshCarrierCaptchaBackendSession/)
})

test('SMB-278: package.json restores playwright:carrier-sync', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.scripts['playwright:carrier-sync'], 'node scripts/playwright-carrier-sync-settings.mjs')
})

test('SMB-278: playwright scripts require app-shell BottomNav and real routes', () => {
  const carrier = read('scripts/playwright-carrier-sync-settings.mjs')
  assert.match(carrier, /\/settings\/carrier-sync/)
  assert.match(carrier, /bottom-nav/)
  assert.match(carrier, /completeOnboarding/)
  assert.match(carrier, /carrier-sync-availability/)
})
