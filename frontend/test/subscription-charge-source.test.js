import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const runtimeSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/app-runtime.service.js'),
  'utf8',
)
const backgroundJobsSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/services/app-runtime-background-jobs.js'),
  'utf8',
)

const subscriptionPageSource = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/subscriptions/SubscriptionListPage.vue'),
  'utf8',
)

test('app runtime runs subscription charges on app open, resume, and active ledger changes', () => {
  assert.match(backgroundJobsSource, /runSubscriptionChargesIfDue/)
  assert.match(backgroundJobsSource, /enqueueLedgerMaintenanceJobs/)
  assert.match(backgroundJobsSource, /subscription-charge:\$\{id\}:\$\{reason\}/)
  assert.match(runtimeSource, /enqueueLedgerMaintenanceJobs\(ledgerStore\.activeLedgerId, 'app_start'\)/)
  assert.match(runtimeSource, /enqueueAppForegroundSyncBatch/)
  assert.match(runtimeSource, /enqueueLedgerMaintenanceJobs\(normalizedLedgerId, 'active_ledger_change'\)/)
})

test('subscription page charges same-day subscription after saving', () => {
  assert.match(subscriptionPageSource, /import \{ runSubscriptionChargesIfDue \} from '@\/core\/services\/subscription-charge\.service'/)
  assert.match(subscriptionPageSource, /runSubscriptionChargesIfDue\(activeLedgerId\.value, \{/)
  assert.match(subscriptionPageSource, /reason: 'subscription_saved'/)
  assert.match(subscriptionPageSource, /rerunAfterCurrent: true/)
})
