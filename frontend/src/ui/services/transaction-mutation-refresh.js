/**
 * ART-10 — Single after-transaction-mutation refresh contract.
 * Stores that write ledger transactions must call this (or transactionStore.refreshAfterWriteSafe).
 */
import { getActivePinia } from 'pinia'
import { useTransactionStore } from '@/ui/stores/transaction.store'

/**
 * @param {{ pinia?: import('pinia').Pinia, timeoutMs?: number }} [options]
 */
export async function afterTransactionMutation(options = {}) {
  const pinia = options.pinia ?? getActivePinia()
  if (!pinia) return
  await useTransactionStore(pinia).refreshAfterWriteSafe(options.timeoutMs)
}
