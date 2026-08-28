import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('SMB-278: bank sync product surface is removed', () => {
  const featureList = read('src/ui/views/FeatureListPage.vue')
  const router = read('src/ui/router/index.js')
  const pkg = JSON.parse(read('package.json'))
  assert.doesNotMatch(featureList, /feature-link-bank-sync/)
  assert.doesNotMatch(featureList, /isBankSyncFeatureEnabled/)
  assert.match(router, /path: '\/settings\/bank-sync\/:pathMatch\(\.\*\)\*'/)
  assert.match(router, /redirect: '\/features'/)
  assert.doesNotMatch(router, /SettingsBankSyncPage/)
  assert.equal(pkg.scripts['playwright:bank-sync'], undefined)
  assert.equal(pkg.scripts['simulate:bank-sync'], undefined)
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
