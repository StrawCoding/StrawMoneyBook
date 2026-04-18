import { useAccountStore } from '@/ui/stores/account.store'
import { useAddonTemplateStore } from '@/ui/stores/addon-template.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { repairLedgerData, scanLedgerIntegrity } from '@/core/services/repair.service'
import {
  resolveInitialActiveLedgerId,
  sumNumericValues,
} from './ledger-runtime.helpers'

const AUTO_CHECKED_LEDGER_IDS = new Set()

export { resolveInitialActiveLedgerId } from './ledger-runtime.helpers'

export function resetLedgerScopedStores(pinia) {
  useAccountStore(pinia).$reset()
  useCategoryStore(pinia).$reset()
  useTransactionStore(pinia).$reset()
  useBudgetStore(pinia).$reset()
  useLoanStore(pinia).$reset()
  useReimbursementStore(pinia).$reset()
  useAddonTemplateStore(pinia).$reset()
}

export async function ensureLedgerIntegrity(ledgerId) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId || AUTO_CHECKED_LEDGER_IDS.has(normalizedLedgerId)) return null

  AUTO_CHECKED_LEDGER_IDS.add(normalizedLedgerId)

  try {
    const before = await scanLedgerIntegrity(normalizedLedgerId)
    const beforeIssueCount = sumNumericValues(before)
    if (beforeIssueCount <= 0) {
      return { before, after: before, fixed: {} }
    }

    const repairResult = await repairLedgerData(normalizedLedgerId)
    const fixedCount = sumNumericValues(repairResult?.fixed)
    const afterIssueCount = sumNumericValues(repairResult?.after)

    if (fixedCount > 0 || afterIssueCount > 0) {
      console.info('[ledger-runtime] auto repair completed', {
        ledgerId: normalizedLedgerId,
        beforeIssueCount,
        fixedCount,
        afterIssueCount,
      })
    }

    return {
      before,
      after: repairResult?.after ?? before,
      fixed: repairResult?.fixed ?? {},
    }
  } catch (error) {
    console.warn('[ledger-runtime] auto repair skipped due to error', error)
    return null
  }
}

export async function loadLedgerScopedStores(ledgerId, pinia) {
  const normalizedLedgerId = String(ledgerId ?? '').trim()
  if (!normalizedLedgerId) {
    resetLedgerScopedStores(pinia)
    return null
  }

  await ensureLedgerIntegrity(normalizedLedgerId)

  const accountStore = useAccountStore(pinia)
  const categoryStore = useCategoryStore(pinia)
  const transactionStore = useTransactionStore(pinia)
  const budgetStore = useBudgetStore(pinia)
  const loanStore = useLoanStore(pinia)
  const reimbursementStore = useReimbursementStore(pinia)
  const addonTemplateStore = useAddonTemplateStore(pinia)

  await Promise.all([
    accountStore.load(),
    categoryStore.load(),
    transactionStore.loadRecent(),
    budgetStore.loadCurrentMonth(),
    loanStore.load(),
    reimbursementStore.load(),
    addonTemplateStore.load(),
  ])

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
