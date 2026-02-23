import { defineStore } from 'pinia'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import {
  addLoanRepayment,
  createLoanWithOptionalTransaction,
  deleteVoidedLoan,
  getLoanDetail,
  loadLoanDashboard,
  restoreLoan,
  updateCompletedLoanPrincipal,
  updateLoanRepayment,
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
      const result = await createLoanWithOptionalTransaction(ledgerStore.activeLedgerId, payload)
      await this.load()
      return result
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

    async updateRepayment(payload) {
      const ledgerStore = useLedgerStore()
      const result = await updateLoanRepayment(ledgerStore.activeLedgerId, payload)
      await this.load()
      if (payload.loanId) {
        await this.loadDetail(payload.loanId)
      } else if (this.detail?.loan?.id) {
        await this.loadDetail(this.detail.loan.id)
      }
      return result
    },

    async updateCompletedPrincipal(payload) {
      const ledgerStore = useLedgerStore()
      const result = await updateCompletedLoanPrincipal(ledgerStore.activeLedgerId, payload)
      await this.load()
      if (payload.loanId) {
        await this.loadDetail(payload.loanId)
      } else if (this.detail?.loan?.id) {
        await this.loadDetail(this.detail.loan.id)
      }
      return result
    },

    async markVoid(loanId) {
      const ledgerStore = useLedgerStore()
      await voidLoan(ledgerStore.activeLedgerId, loanId)
      await this.load()
      if (this.detail?.loan?.id === loanId) {
        await this.loadDetail(loanId)
      }
    },

    async restoreVoided(loanId) {
      const ledgerStore = useLedgerStore()
      await restoreLoan(ledgerStore.activeLedgerId, loanId)
      await this.load()
      if (this.detail?.loan?.id === loanId) {
        await this.loadDetail(loanId)
      }
    },

    async deleteVoided(loanId) {
      const ledgerStore = useLedgerStore()
      await deleteVoidedLoan(ledgerStore.activeLedgerId, loanId)
      await this.load()
      if (this.detail?.loan?.id === loanId) {
        this.detail = null
      }
    },

    async loadDetail(loanId) {
      const ledgerStore = useLedgerStore()
      this.detail = await getLoanDetail(ledgerStore.activeLedgerId, loanId)
    },
  },
})
