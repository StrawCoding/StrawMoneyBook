import { bootstrapCoreDatabase } from '@/core/services/bootstrap.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import {
  loadLedgerScopedStores,
  resetLedgerScopedStores,
} from '@/ui/services/ledger-runtime.service'
import { installMembershipNavigation } from '@/ui/services/membership-navigation.service'

export async function bootstrapApp(pinia, options = {}) {
  installMembershipNavigation()
  await bootstrapCoreDatabase()

  const ledgerStore = useLedgerStore(pinia)
  await ledgerStore.init(options)

  if (!ledgerStore.activeLedgerId) {
    resetLedgerScopedStores(pinia)
    return { ledgerStore, hasActiveLedger: false }
  }

  await loadLedgerScopedStores(ledgerStore.activeLedgerId, pinia)
  return { ledgerStore, hasActiveLedger: true }
}
