import { defineStore } from 'pinia'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import {
  listReimbursementTransactions,
  markTransactionReimbursed,
} from '@/core/repositories/transaction.repo'
import {
  cancelReimbursableExpenseSettlement,
  createReimbursementAdvanceEntry,
  deleteReimbursementAdvanceEntry,
  listReimbursementAdvancesData,
  settleReimbursableExpense,
} from '@/core/services/reimbursement.service'
import {
  reimbursementPendingMinor,
  reimbursementReimbursedMinor,
  withReimbursementDerivedFields,
} from '@/ui/utils/reimbursement-item'

export const useReimbursementStore = defineStore('reimbursement', {
  state: () => ({
    pendingItems: [],
    reimbursedItems: [],
    advances: [],
    loading: false,
  }),

  getters: {
    pendingTotalMinor(state) {
      return state.pendingItems.reduce((total, item) => total + reimbursementPendingMinor(item), 0)
    },

    reimbursedTotalMinor(state) {
      return state.reimbursedItems.reduce((total, item) => total + reimbursementReimbursedMinor(item), 0)
    },

    availableAdvances(state) {
      return state.advances.filter((item) => Number(item.available_minor ?? 0) > 0)
    },

    availableAdvanceTotalMinor() {
      return this.availableAdvances.reduce((total, item) => total + Number(item.available_minor ?? 0), 0)
    },
  },

  actions: {
    async load() {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) return

      this.loading = true
      try {
        const [pendingItems, reimbursedItems, advances] = await Promise.all([
          listReimbursementTransactions(ledgerStore.activeLedgerId, 'pending'),
          listReimbursementTransactions(ledgerStore.activeLedgerId, 'reimbursed'),
          listReimbursementAdvancesData(ledgerStore.activeLedgerId),
        ])
        this.pendingItems = pendingItems.map((item) => withReimbursementDerivedFields(item))
        this.reimbursedItems = reimbursedItems.map((item) => withReimbursementDerivedFields(item))
        this.advances = advances
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
      if (!options?.skipReload) {
        await this.load()
      }
      return result
    },

    async createAdvance(payload = {}, options = {}) {
      const ledgerStore = useLedgerStore()
      const result = await createReimbursementAdvanceEntry(ledgerStore.activeLedgerId, payload)
      if (!options?.skipReload) {
        await this.load()
      }
      return result
    },

    async deleteAdvance(advanceId, options = {}) {
      const ledgerStore = useLedgerStore()
      const result = await deleteReimbursementAdvanceEntry(ledgerStore.activeLedgerId, advanceId)
      if (!options?.skipReload) {
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
