import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const runtimeSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/app-runtime.service.js'),
  'utf8',
)

const subscriptionPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/subscriptions/SubscriptionListPage.vue'),
  'utf8',
)

test('app runtime runs subscription charges on app open, resume, and active ledger changes', () => {
  assert.match(runtimeSource, /import \{ runSubscriptionChargesIfDue \} from '@\/core\/services\/subscription-charge\.service'/)
  assert.match(runtimeSource, /runSubscriptionChargesInBackground\(currentLedgerId, 'app_resume'\)/)
  assert.match(runtimeSource, /runSubscriptionChargesInBackground\(ledgerStore\.activeLedgerId, 'app_start'\)/)
  assert.match(runtimeSource, /runSubscriptionChargesInBackground\(normalizedLedgerId, 'active_ledger_change'\)/)
})

test('subscription page charges same-day subscription after saving', () => {
  assert.match(subscriptionPageSource, /import \{ runSubscriptionChargesIfDue \} from '@\/core\/services\/subscription-charge\.service'/)
  assert.match(subscriptionPageSource, /runSubscriptionChargesIfDue\(activeLedgerId\.value, \{/)
  assert.match(subscriptionPageSource, /reason: 'subscription_saved'/)
  assert.match(subscriptionPageSource, /rerunAfterCurrent: true/)
})
