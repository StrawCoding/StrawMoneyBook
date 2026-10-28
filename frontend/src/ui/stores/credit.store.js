import { defineStore } from 'pinia'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { translateMessage } from '@/ui/services/i18n.service.js'
import { afterTransactionMutation } from '@/ui/services/transaction-mutation-refresh.js'
import {
  archiveCreditCardAccount,
  createCreditPurchase,
  createCreditRepayment,
  createCreditCardAccount,
  isCreditHomeCardEnabled,
  loadCreditCardDashboard,
  previewCreditRepaymentAllocations,
  removeCreditCardAccount,
  restoreCreditCardAccount,
  runCreditStatementRollovers,
  setCreditHomeCardEnabled,
  updateCreditCardProfile,
} from '@/core/services/credit.service'
import { syncCreditDueRemindersForLedger } from '@/ui/services/credit-due-reminder.service'

export const useCreditStore = defineStore('credit', {
  state: () => ({
    cards: [],
    reminders: [],
    homeCardEnabled: false,
    showArchived: false,
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
        const dashboard = await loadCreditCardDashboard(ledgerStore.activeLedgerId, {
          includeArchived: this.showArchived,
        })
        this.cards = dashboard.cards
        this.reminders = dashboard.reminders
        this.homeCardEnabled = await isCreditHomeCardEnabled(ledgerStore.activeLedgerId)
        void syncCreditDueRemindersForLedger(ledgerStore.activeLedgerId).catch(() => {})
      } finally {
        this.loading = false
      }
    },

    async setShowArchived(show) {
      this.showArchived = Boolean(show)
      await this.load()
    },

    async setHomeCardEnabled(enabled) {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) return
      await setCreditHomeCardEnabled(ledgerStore.activeLedgerId, enabled)
      this.homeCardEnabled = Boolean(enabled)
    },

    async createCard(payload) {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) throw new Error(translateMessage('common.no_ledger_selected', '尚未選擇帳本'))
      const account = await createCreditCardAccount(ledgerStore.activeLedgerId, payload)
      await this.load()
      return account
    },

    async updateCard(accountId, payload) {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) throw new Error(translateMessage('common.no_ledger_selected', '尚未選擇帳本'))
      const account = await updateCreditCardProfile(ledgerStore.activeLedgerId, accountId, payload)
      await this.load()
      return account
    },

    async archiveCard(accountId) {
      const ledgerStore = useLedgerStore()
      await archiveCreditCardAccount(ledgerStore.activeLedgerId, accountId)
      await this.load()
    },

    async restoreCard(accountId) {
      const ledgerStore = useLedgerStore()
      await restoreCreditCardAccount(ledgerStore.activeLedgerId, accountId)
      await this.load()
    },

    async removeCard(accountId) {
      const ledgerStore = useLedgerStore()
      const result = await removeCreditCardAccount(ledgerStore.activeLedgerId, accountId)
      await this.load()
      return result
    },

    async previewRepay(payload) {
      const ledgerStore = useLedgerStore()
      return previewCreditRepaymentAllocations(ledgerStore.activeLedgerId, payload)
    },

    async purchase(payload) {
      const ledgerStore = useLedgerStore()
      const result = await createCreditPurchase(ledgerStore.activeLedgerId, payload)
      await this.load()
      await afterTransactionMutation()
      return result
    },

    async repay(payload) {
      const ledgerStore = useLedgerStore()
      const result = await createCreditRepayment(ledgerStore.activeLedgerId, payload)
      await this.load()
      await afterTransactionMutation()
      return result
    },
  },
})
