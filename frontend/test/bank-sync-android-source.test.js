import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

const bankAutomationActivitySource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/BankAutomationActivity.java',
)
const bankSyncOrchestratorSource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/BankSyncOrchestrator.java',
)
const bankProviderRegistrySource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/core/BankProviderRegistry.java',
)
const huaNanProviderSource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/HuaNanBankProvider.java',
)
const huaNanBankAutomationSource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/HuaNanBankAutomation.java',
)
const captchaSolverSource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/core/CaptchaSolver.java',
)
const bankSyncContractSource = read(
  'android/app/src/main/java/com/strawcoding/strawmoneybook/BankAutomationSyncContract.java',
)
const providerRegistrySource = read('src/services/bank-sync/provider-registry.js')

test('bank automation activity uses desktop viewport and orchestrator dispatch', () => {
  assert.match(bankAutomationActivitySource, /DESKTOP_VIEWPORT_WIDTH = 1280/)
  assert.match(bankAutomationActivitySource, /BankSyncOrchestrator\.connect/)
  assert.doesNotMatch(bankAutomationActivitySource, /FirstBankAutomation/)
  assert.doesNotMatch(bankAutomationActivitySource, /first_bank_tw/)
})

test('Architecture B modular registry registers hua_nan only', () => {
  assert.match(bankProviderRegistrySource, /HUA_NAN_BANK_TW/)
  assert.match(bankProviderRegistrySource, /HuaNanBankProvider/)
  assert.match(bankSyncOrchestratorSource, /BankProviderRegistry\.resolve/)
  assert.match(huaNanProviderSource, /implements BankProvider/)
  assert.doesNotMatch(providerRegistrySource, /first_bank_tw/)
})

test('hua nan automation uses modular core captcha and sync contract', () => {
  assert.match(huaNanBankAutomationSource, /CaptchaSolver/)
  assert.match(huaNanBankAutomationSource, /BankAutomationSyncContract/)
  assert.match(huaNanBankAutomationSource, /hua_nan_bank_tw/)
  assert.match(huaNanBankAutomationSource, /CaptchaImage_2\.jsp/)
})

test('captcha solver validates length and charset before submit', () => {
  assert.match(captchaSolverSource, /validateCaptchaCandidate/)
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

test('bank automation plugin exposes captcha submit and abort actions', () => {
  const pluginSource = read(
    'android/app/src/main/java/com/strawcoding/strawmoneybook/BankAutomationPlugin.java',
  )
  const activitySource = read(
    'android/app/src/main/java/com/strawcoding/strawmoneybook/BankAutomationActivity.java',
  )
  assert.match(pluginSource, /submitCaptcha/)
  assert.match(pluginSource, /abortBank/)
  assert.match(activitySource, /ACTION_SUBMIT_CAPTCHA/)
  assert.match(activitySource, /ACTION_ABORT_BANK/)
  assert.match(activitySource, /abortRunningSession/)
})

test('bank sync contract supports partial account results', () => {
  assert.match(bankSyncContractSource, /accountResultPartial/)
  assert.match(bankSyncContractSource, /"partial"/)
})
