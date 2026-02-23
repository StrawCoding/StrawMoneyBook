import { defineStore } from 'pinia'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import {
  listReimbursementTransactions,
  markTransactionReimbursed,
} from '@/core/repositories/transaction.repo'
import { cancelReimbursableExpenseSettlement, settleReimbursableExpense } from '@/core/services/reimbursement.service'

export const useReimbursementStore = defineStore('reimbursement', {
  state: () => ({
    pendingItems: [],
    reimbursedItems: [],
    loading: false,
  }),

  getters: {
    pendingTotalMinor(state) {
      return state.pendingItems.reduce((total, item) => total + Math.abs(Number(item.amount_minor ?? 0)), 0)
    },

    reimbursedTotalMinor(state) {
      return state.reimbursedItems.reduce((total, item) => total + Math.abs(Number(item.amount_minor ?? 0)), 0)
    },
  },

  actions: {
    async load() {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) return

      this.loading = true
      try {
        const [pendingItems, reimbursedItems] = await Promise.all([
          listReimbursementTransactions(ledgerStore.activeLedgerId, 'pending'),
          listReimbursementTransactions(ledgerStore.activeLedgerId, 'reimbursed'),
        ])
        this.pendingItems = pendingItems
        this.reimbursedItems = reimbursedItems
      } finally {
        this.loading = false
      }
    },

    async markReimbursed(txId) {
      const ledgerStore = useLedgerStore()
      await markTransactionReimbursed(ledgerStore.activeLedgerId, txId, true)
      await this.load()
    },

    async settle(txId, payload = {}, options = {}) {
      const ledgerStore = useLedgerStore()
      const result = await settleReimbursableExpense(ledgerStore.activeLedgerId, {
        txId,
        ...payload,
      })
      if (options.reload !== false) {
        await this.load()
      }
      return result
    },

    async markUnreimbursed(txId) {
      const ledgerStore = useLedgerStore()
      await cancelReimbursableExpenseSettlement(ledgerStore.activeLedgerId, txId)
      await this.load()
    },
  },
})
