import { backgroundWorkQueue } from './background-work-queue.service.js'
import { runBankSyncAutoRefreshIfDue } from './bank-sync-auto-refresh.service.js'
import { runExchangeRateAutoSyncIfDue } from './exchange-rate.service.js'
import { runAutoBackupProvidersIfDue } from './auto-backup-orchestrator.service.js'
import { runCarrierSyncAutoRefreshInBackground } from '@/services/einvoice/carrier-sync.service.js'
import { syncBookkeepingRemindersForAllLedgers } from './bookkeeping-reminder.service.js'
import { syncCreditDueRemindersForAllLedgers } from './credit-due-reminder.service.js'
import { runSavingsJarAutoSaveIfDue } from '@/core/services/savings-jar-auto-save.service'
import { runSubscriptionChargesIfDue } from '@/core/services/subscription-charge.service'
import { runBudgetSaveIfDue } from '@/core/services/budget-save.service'
import { runDueSecuritySettlements } from '@/core/services/security.service'
import { runCreditStatementRollovers } from '@/core/services/credit.service'
import { runSharedLedgerBackgroundSyncNow } from './shared-ledger.service.js'
import { runGoogleDriveLedgerBackgroundSyncNow } from './google-drive-ledger-sync.service.js'

function enqueueNamed(name, fn) {
  return backgroundWorkQueue.enqueue(name, fn)
}

export function enqueueBookkeepingReminderSync(reason) {
  return enqueueNamed(`bookkeeping-reminder:${reason}`, () => (
    syncBookkeepingRemindersForAllLedgers().catch((error) => {
      console.warn(`[bookkeeping-reminder] background sync failed (${reason})`, error)
    })
  ))
}

export function enqueueCreditDueReminderSync(reason) {
  return enqueueNamed(`credit-due-reminder:${reason}`, () => (
    syncCreditDueRemindersForAllLedgers().catch((error) => {
      console.warn(`[credit-due-reminder] background sync failed (${reason})`, error)
    })
  ))
}

export function enqueueLedgerMaintenanceJobs(ledgerId, reason) {
  const id = String(ledgerId ?? '').trim()
  if (!id) return
  enqueueNamed(`savings-jar:${id}:${reason}`, () => (
    runSavingsJarAutoSaveIfDue(id, { reason }).catch((error) => {
      console.warn(`[savings-jar-auto-save] run failed (${reason})`, error)
    })
  ))
  enqueueNamed(`subscription-charge:${id}:${reason}`, () => (
    runSubscriptionChargesIfDue(id, { reason }).catch((error) => {
      console.warn(`[subscription-charge] run failed (${reason})`, error)
    })
  ))
  enqueueNamed(`budget-save:${id}:${reason}`, () => (
    runBudgetSaveIfDue(id, { reason }).catch((error) => {
      console.warn(`[budget-save] run failed (${reason})`, error)
    })
  ))
  enqueueNamed(`security-settlement:${id}:${reason}`, () => (
    runDueSecuritySettlements(id).catch((error) => {
      console.warn(`[security-settlement] run failed (${reason})`, error)
    })
  ))
  enqueueNamed(`credit-rollover:${id}:${reason}`, () => (
    runCreditStatementRollovers(id).catch((error) => {
      console.warn(`[credit-rollover] run failed (${reason})`, error)
    })
  ))
}

export function enqueueExchangeRateAutoSync(ledgerId) {
  const id = String(ledgerId ?? '').trim()
  if (!id) return
  enqueueNamed(`exchange-rate:${id}`, () => runExchangeRateAutoSyncIfDue(id))
}

export function enqueueBankSyncAutoRefresh(ledgerId, reason) {
  const id = String(ledgerId ?? '').trim()
  if (!id) return Promise.resolve()
  return enqueueNamed(`bank-auto-refresh:${id}`, () => runBankSyncAutoRefreshIfDue(id, { reason }))
}

export function enqueueCarrierSyncAutoRefresh(ledgerId, reason) {
  const id = String(ledgerId ?? '').trim()
  if (!id) return Promise.resolve()
  return enqueueNamed(`carrier-auto-refresh:${id}`, () => runCarrierSyncAutoRefreshInBackground(id, reason))
}

export function enqueueSharedLedgerBackgroundSync(pinia, reason = 'background') {
  return enqueueNamed(`shared-ledger-sync:${reason}`, () => runSharedLedgerBackgroundSyncNow(pinia))
}

export function enqueueGoogleDriveLedgerBackgroundSync(pinia, reason = 'background') {
  return enqueueNamed(`drive-ledger-sync:${reason}`, () => runGoogleDriveLedgerBackgroundSyncNow(pinia))
}

export function enqueueAutoBackupDueCheck(ledgerId) {
  const id = String(ledgerId ?? '').trim()
  if (!id) return Promise.resolve([])
  return enqueueNamed(`auto-backup-due:${id}`, () => runAutoBackupProvidersIfDue(id))
}

/**
 * Resume / cold-start batch: reminders and ledger maintenance first, then network sync (bank/carrier).
 */
export function enqueueAppForegroundSyncBatch({ pinia, ledgerId, reason = 'app_resume' }) {
  enqueueBookkeepingReminderSync(reason)
  enqueueCreditDueReminderSync(reason)
  const id = String(ledgerId ?? '').trim()
  if (id) {
    enqueueLedgerMaintenanceJobs(id, reason)
    enqueueExchangeRateAutoSync(id)
    enqueueSharedLedgerBackgroundSync(pinia, reason)
    enqueueGoogleDriveLedgerBackgroundSync(pinia, reason)
    enqueueAutoBackupDueCheck(id)
    enqueueBankSyncAutoRefresh(id, reason)
    enqueueCarrierSyncAutoRefresh(id, reason)
  } else {
    enqueueSharedLedgerBackgroundSync(pinia, reason)
    enqueueGoogleDriveLedgerBackgroundSync(pinia, reason)
  }
}
