import { useAccountStore } from '@/ui/stores/account.store'
import { useAddonTemplateStore } from '@/ui/stores/addon-template.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { scanLedgerIntegrity } from '@/core/services/repair.service'
import {
  recordLedgerIntegrityScan,
} from '@/core/services/data-wipe-guard.service'
import {
  resolveInitialActiveLedgerId,
  sumNumericValues,
} from './ledger-runtime.helpers'

const AUTO_CHECKED_LEDGER_IDS = new Set()
const DEFERRED_HYDRATION_LEDGER_IDS = new Set()

export { resolveInitialActiveLedgerId } from './ledger-runtime.helpers'

export function resetLedgerScopedStores(pinia) {
  useAccountStore(pinia).$reset()
  useCategoryStore(pinia).$reset()
  useTransactionStore(pinia).$reset()
  useBudgetStore(pinia).$reset()
  useLoanStore(pinia).$reset()
  useReimbursementStore(pinia).$reset()
  useAddonTemplateStore(pinia).$reset()
  DEFERRED_HYDRATION_LEDGER_IDS.clear()
}

/**
 * smb297: Scan-only integrity check on ledger load.
 * Never auto-call repairLedgerData — silent remaps (repair account / null category /
 * unlink transfers) rewrite bookkeeping semantics after updates without consent.
 */
export async function ensureLedgerIntegrity(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId || AUTO_CHECKED_LEDGER_IDS.has(normalizedLedgerId)) return null

  AUTO_CHECKED_LEDGER_IDS.add(normalizedLedgerId)

  try {
    const before = await scanLedgerIntegrity(normalizedLedgerId)
    const beforeIssueCount = sumNumericValues(before)

    recordLedgerIntegrityScan({
      ledgerId: normalizedLedgerId,
      issueCount: beforeIssueCount,
      issues: before,
      autoRepaired: false,
    })

    if (beforeIssueCount > 0) {
      console.warn('[ledger-runtime] integrity issues detected (no silent auto-repair)', {
        ledgerId: normalizedLedgerId,
        beforeIssueCount,
        before,
      })
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        const detail = {
          ledgerId: normalizedLedgerId,
          issueCount: beforeIssueCount,
          issues: before,
        }
        if (typeof CustomEvent === 'function') {
          window.dispatchEvent(new CustomEvent('app:ledger-integrity-issues', { detail }))
        } else {
          window.dispatchEvent(new Event('app:ledger-integrity-issues'))
        }
      }
    }

    return {
      before,
      after: before,
      fixed: {},
      autoRepaired: false,
      issueCount: beforeIssueCount,
    }
  } catch (error) {
    console.warn('[ledger-runtime] integrity scan skipped due to error', error)
    return null
  }
}

function scheduleMicrotask(task, windowObject = globalThis.window) {
  if (windowObject && typeof windowObject.setTimeout === 'function') {
    windowObject.setTimeout(() => {
      void task()
    }, 0)
    return
  }
  void task()
}

async function hydrateSecondaryLedgerStores(pinia) {
  await Promise.all([
    useTransactionStore(pinia).loadRecent(),
    useLoanStore(pinia).load(),
    useReimbursementStore(pinia).load(),
    useAddonTemplateStore(pinia).load(),
  ])
}

function clearSecondaryLedgerStores(pinia) {
  useLoanStore(pinia).$reset()
  useReimbursementStore(pinia).$reset()
  useAddonTemplateStore(pinia).$reset()
  useTransactionStore(pinia).recent = []
}

function scheduleDeferredLedgerHydration(ledgerId, pinia) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId || DEFERRED_HYDRATION_LEDGER_IDS.has(normalizedLedgerId)) return

  DEFERRED_HYDRATION_LEDGER_IDS.add(normalizedLedgerId)
  scheduleMicrotask(async () => {
    if (String(useLedgerStore(pinia).activeLedgerId ?? '').trim() !== normalizedLedgerId) {
      DEFERRED_HYDRATION_LEDGER_IDS.delete(normalizedLedgerId)
      return
    }

    try {
      // Scan-only; destructive repair requires explicit UX confirmation (data management).
      await ensureLedgerIntegrity(normalizedLedgerId)
      if (String(useLedgerStore(pinia).activeLedgerId ?? '').trim() !== normalizedLedgerId) {
        return
      }

      await hydrateSecondaryLedgerStores(pinia)
    } catch (error) {
      console.warn('[ledger-runtime] deferred hydration failed', error)
      DEFERRED_HYDRATION_LEDGER_IDS.delete(normalizedLedgerId)
    }
  })
}

export async function loadLedgerScopedStores(ledgerId, pinia) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) {
    resetLedgerScopedStores(pinia)
    return null
  }

  const accountStore = useAccountStore(pinia)
  const categoryStore = useCategoryStore(pinia)
  const transactionStore = useTransactionStore(pinia)
  const budgetStore = useBudgetStore(pinia)
  const loanStore = useLoanStore(pinia)
  const reimbursementStore = useReimbursementStore(pinia)
  const addonTemplateStore = useAddonTemplateStore(pinia)

  // Avoid showing previous ledger loan/reimbursement/addon while critical path paints.
  clearSecondaryLedgerStores(pinia)
  DEFERRED_HYDRATION_LEDGER_IDS.delete(normalizedLedgerId)

  // Critical path for startup → home interactivity: accounts, categories, current budget period.
  await Promise.all([
    accountStore.load(),
    categoryStore.load(),
    budgetStore.loadCurrentMonth(),
  ])

  scheduleDeferredLedgerHydration(normalizedLedgerId, pinia)

  return {
    accountStore,
    categoryStore,
    transactionStore,
    budgetStore,
    loanStore,
    reimbursementStore,
    addonTemplateStore,
  }
}
