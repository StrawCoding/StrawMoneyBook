import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const bankAutomationActivitySource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/BankAutomationActivity.java',
)
const huaNanBankAutomationSource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/HuaNanBankAutomation.java',
)
const captchaSolverSource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/core/CaptchaSolver.java',
)
const bankSyncContractSource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/core/BankSyncContract.java',
)
const providerRegistrySource = read('src/services/bank-sync/provider-registry.js')

test('bank automation activity forces desktop viewport for webview', () => {
  assert.match(bankAutomationActivitySource, /DESKTOP_VIEWPORT_WIDTH = 1280/)
  assert.match(bankAutomationActivitySource, /setLoadWithOverviewMode\(false\)/)
  assert.match(bankAutomationActivitySource, /setInitialScale\(100\)/)
  assert.match(bankAutomationActivitySource, /Windows NT 10\.0; Win64; x64/)
})

test('first bank provider is disabled at activity dispatch', () => {
  assert.match(bankAutomationActivitySource, /first_bank_tw.*bank_provider_disabled/s)
  assert.doesNotMatch(bankAutomationActivitySource, /FirstBankAutomation/)
})

test('hua nan automation uses modular core captcha and sync contract', () => {
  assert.match(huaNanBankAutomationSource, /CaptchaSolver/)
  assert.match(huaNanBankAutomationSource, /BankSyncContract/)
  assert.match(huaNanBankAutomationSource, /hua_nan_bank_tw/)
  assert.match(huaNanBankAutomationSource, /TrxCaptchaKey/)
  assert.match(huaNanBankAutomationSource, /CaptchaImage_2\.jsp/)
})

test('captcha solver validates length and charset before submit', () => {
  assert.match(captchaSolverSource, /isValidForSubmit/)
  assert.match(captchaSolverSource, /MIN_CONFIDENCE/)
  assert.match(captchaSolverSource, /EXPECTED_LENGTH = 4/)
  assert.match(captchaSolverSource, /recognizeFromDataUrl/)
})

test('bank sync contract dual-key watermark precedence', () => {
  assert.match(bankSyncContractSource, /lastSyncAt/)
  assert.match(bankSyncContractSource, /last_sync_at/)
  assert.match(bankSyncContractSource, /resolveQueryStartDate/)
  assert.match(bankSyncContractSource, /readLookbackDays/)
})

test('hua nan intercept observe-only — POST never replay', () => {
  assert.match(huaNanBankAutomationSource, /shouldReplayTransactionInterceptRequest/)
  assert.match(huaNanBankAutomationSource, /INTERCEPT_SKIP_REASON_POST/)
  assert.match(huaNanBankAutomationSource, /observe_only_no_replay/)
})

test('provider registry lists hua nan only (first bank disabled)', () => {
  assert.match(providerRegistrySource, /hua_nan_bank_tw/)
  assert.match(providerRegistrySource, /enabled: false/)
  assert.match(providerRegistrySource, /DISABLED_PROVIDER_IDS/)
  assert.doesNotMatch(providerRegistrySource, /enabled: true[\s\S]*first_bank_tw/)
})

test('jvm captcha and sync contract tests exist', () => {
  const captchaTest = read('android/app/src/test/java/com/strawcoding/strawmoneybook/core/CaptchaSolverTest.java')
  const contractTest = read('android/app/src/test/java/com/strawcoding/strawmoneybook/core/BankSyncContractTest.java')
  assert.match(captchaTest, /CaptchaSolverTest/)
  assert.match(captchaTest, /isValidForSubmitEnforcesNumericCharsetForHuaNan/)
  assert.match(contractTest, /readLastSyncWatermarkPrefersLastSyncAtOverSnakeCase/)
})
