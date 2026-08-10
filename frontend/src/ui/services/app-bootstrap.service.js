import { bootstrapCoreDatabase } from '@/core/services/bootstrap.service'
import {
  detectEmptyLedgerRestoreHint,
  emitEmptyLedgerRestoreHint,
} from '@/core/services/empty-ledger-restore-hint.service'
import { useAccountStore } from '@/ui/stores/account.store'
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
  const accountStore = useAccountStore(pinia)
  await ledgerStore.init(options)

  if (!ledgerStore.activeLedgerId) {
    resetLedgerScopedStores(pinia)
    // smb298: empty live DB + durable recovery → visible restore hint (not only create-ledger).
    try {
      const hint = await detectEmptyLedgerRestoreHint({
        hasLedgers: ledgerStore.ledgers.length > 0,
        hasAccounts: accountStore.accounts.length > 0,
      })
      if (hint.shouldPrompt) {
        emitEmptyLedgerRestoreHint(hint)
      }
    } catch (error) {
      console.warn('[bootstrap] empty-ledger restore hint skipped', error)
    }
    return { ledgerStore, hasActiveLedger: false }
  }

  await loadLedgerScopedStores(ledgerStore.activeLedgerId, pinia)
  return { ledgerStore, hasActiveLedger: true }
}
