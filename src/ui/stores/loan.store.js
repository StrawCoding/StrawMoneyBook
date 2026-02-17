import { defineStore } from 'pinia'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import {
  addLoanRepayment,
  createLoanWithOptionalTransaction,
  getLoanDetail,
  loadLoanDashboard,
  voidLoan,
} from '@/core/services/loan.service'

export const useLoanStore = defineStore('loan', {
  state: () => ({
    items: [],
    summary: {
      activeCount: 0,
      totalReceivable: 0,
      totalPayable: 0,
    },
    detail: null,
    loading: false,
  }),

  actions: {
    async load() {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) return

      this.loading = true
      try {
        const dashboard = await loadLoanDashboard(ledgerStore.activeLedgerId)
        this.items = dashboard.loans
        this.summary = dashboard.summary
      } finally {
        this.loading = false
      }
    },

    async create(payload) {
      const ledgerStore = useLedgerStore()
      await createLoanWithOptionalTransaction(ledgerStore.activeLedgerId, payload)
      await this.load()
    },

    async repay(payload) {
      const ledgerStore = useLedgerStore()
      const result = await addLoanRepayment(ledgerStore.activeLedgerId, payload)
      await this.load()
      if (this.detail?.loan?.id === payload.loanId) {
        await this.loadDetail(payload.loanId)
      }
      return result
    },

    async markVoid(loanId) {
      const ledgerStore = useLedgerStore()
      await voidLoan(ledgerStore.activeLedgerId, loanId)
      await this.load()
    },

    async loadDetail(loanId) {
      const ledgerStore = useLedgerStore()
      this.detail = await getLoanDetail(ledgerStore.activeLedgerId, loanId)
    },
  },
})
