import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const carrierPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/settings/SettingsCarrierSyncPage.vue'),
  'utf8',
)

test('playwright carrier-sync drives formal product UI via data-testid (no runFormal* shortcuts)', () => {
  const playwrightSource = readFileSync(
    resolve(import.meta.dirname, '../scripts/playwright-carrier-sync-settings.mjs'),
    'utf8',
  )
  assert.doesNotMatch(playwrightSource, /runFormalCarrierSyncViaHook|runFormalImportViaHook/)
  assert.match(playwrightSource, /\[data-testid=carrier-sync-field-phone\]/)
  assert.match(playwrightSource, /\[data-testid=carrier-sync-field-password\]/)
  assert.match(playwrightSource, /\[data-testid=carrier-sync-sync-now\]/)
  assert.match(playwrightSource, /\[data-testid=carrier-sync-captcha-input\]/)
  assert.match(playwrightSource, /\[data-testid=carrier-sync-review-select-all\]/)
  assert.match(playwrightSource, /\[data-testid=carrier-sync-review-import\]/)
  assert.match(playwrightSource, /runFormalCarrierSyncFlow/)
  assert.match(playwrightSource, /Playwright Carrier Shop/)
  assert.match(playwrightSource, /assertPreviewPortFree/)
  assert.match(playwrightSource, /stopPreviewProcess/)
  // Web has no WebView: orchestrator fixtures are allowed; UI clicks must still exercise service/DB.
  assert.match(carrierPageSource, /setCarrierSyncOrchestratorDependenciesForTest/)
  assert.match(carrierPageSource, /fetchCarrierInvoicesForTest/)
  assert.match(carrierPageSource, /data-testid="carrier-sync-sync-now"/)
  assert.match(carrierPageSource, /data-testid="carrier-sync-review-import"/)
  assert.match(carrierPageSource, /verifyLedgerAfterImport/)
})
