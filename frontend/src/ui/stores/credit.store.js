import { defineStore } from 'pinia'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import {
  createCreditPurchase,
  createCreditRepayment,
  createCreditCardAccount,
  isCreditHomeCardEnabled,
  loadCreditCardDashboard,
  runCreditStatementRollovers,
  setCreditHomeCardEnabled,
} from '@/core/services/credit.service'

export const useCreditStore = defineStore('credit', {
  state: () => ({
    cards: [],
    reminders: [],
    homeCardEnabled: false,
    loading: false,
  }),

  actions: {
    async runRollovers() {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) return []
      return runCreditStatementRollovers(ledgerStore.activeLedgerId)
    },

    async load() {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) return
      this.loading = true
      try {
        await this.runRollovers()
        const dashboard = await loadCreditCardDashboard(ledgerStore.activeLedgerId)
        this.cards = dashboard.cards
        this.reminders = dashboard.reminders
        this.homeCardEnabled = await isCreditHomeCardEnabled(ledgerStore.activeLedgerId)
      } finally {
        this.loading = false
      }
    },

    async setHomeCardEnabled(enabled) {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) return
      await setCreditHomeCardEnabled(ledgerStore.activeLedgerId, enabled)
      this.homeCardEnabled = Boolean(enabled)
    },

    async createCard(payload) {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) throw new Error('尚未選擇帳本')
      const account = await createCreditCardAccount(ledgerStore.activeLedgerId, payload)
      await this.load()
      return account
    },

    async purchase(payload) {
      const ledgerStore = useLedgerStore()
      const result = await createCreditPurchase(ledgerStore.activeLedgerId, payload)
      await this.load()
      return result
    },

    async repay(payload) {
      const ledgerStore = useLedgerStore()
      const result = await createCreditRepayment(ledgerStore.activeLedgerId, payload)
      await this.load()
      return result
    },
  },
})
