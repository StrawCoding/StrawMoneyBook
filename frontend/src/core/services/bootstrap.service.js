import { initDatabase, resetDatabase } from '@/core/db/sqlite'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useAddonTemplateStore } from '@/ui/stores/addon-template.store'

function isRecoverableBootstrapError(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase()
  return (
    // Android: errors that escaped sqlite.js internal recovery (rebuild + recovery-db both failed)
    message.includes('[sqlite:android]') ||
    // Schema-level errors on other platforms (iOS, web) where sqlite.js has no internal recovery
    message.includes('datatype mismatch') ||
    message.includes('no such column') ||
    message.includes('no such table') ||
    message.includes('code20') ||
    message.includes('code 20')
    // NOTE: 'code 1' (SQLITE_ERROR) was intentionally removed — it is a generic SQLite error
    // that covers unrelated failures (disk full, permission denied, SQL syntax errors, etc.)
    // and caused the entire local database to be silently wiped on any SQL error.
  )
}

async function loadStores(pinia) {
  const ledgerStore = useLedgerStore(pinia)
  await ledgerStore.init()

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
}

export async function bootstrapApp(pinia) {
  try {
    await initDatabase()
  } catch (error) {
    if (!isRecoverableBootstrapError(error)) {
      throw error
    }

    console.warn('[bootstrap] recoverable sqlite error, resetting local database')
    await resetDatabase()
  }

  await loadStores(pinia)
}
