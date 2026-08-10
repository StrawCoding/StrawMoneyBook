import { defineStore } from 'pinia'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import {
  addSecurityBuy,
  addSecuritySell,
  createSecurityWithOptionalBuy,
  loadSecuritiesDashboard,
  loadSecurityDetail,
  removeSecurity,
  removeSecurityTransaction,
  updateSecurityProfile,
} from '@/core/services/security.service'

export const useSecurityStore = defineStore('security', {
  state: () => ({
    items: [],
    summary: {
      count: 0,
      includedMarketValueMinor: 0,
      totalMarketValueMinor: 0,
      totalInvestedMinor: 0,
      totalDeltaMinor: 0,
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
        const dashboard = await loadSecuritiesDashboard(ledgerStore.activeLedgerId)
        this.items = dashboard.items
        this.summary = dashboard.summary
      } finally {
        this.loading = false
      }
    },

    async loadDetail(securityId) {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) return null
      this.detail = await loadSecurityDetail(ledgerStore.activeLedgerId, securityId)
      return this.detail
    },

    async create(payload) {
      const ledgerStore = useLedgerStore()
      const result = await createSecurityWithOptionalBuy(ledgerStore.activeLedgerId, payload)
      await this.load()
      return result
    },

    async update(securityId, payload) {
      const ledgerStore = useLedgerStore()
      const result = await updateSecurityProfile(ledgerStore.activeLedgerId, securityId, payload)
      await this.load()
      if (this.detail?.security?.id === securityId) {
        await this.loadDetail(securityId)
      }
      return result
    },

    async buy(payload) {
      const ledgerStore = useLedgerStore()
      const result = await addSecurityBuy(ledgerStore.activeLedgerId, payload)
      await this.load()
      if (payload.securityId) await this.loadDetail(payload.securityId)
      return result
    },

    async sell(payload) {
      const ledgerStore = useLedgerStore()
      const result = await addSecuritySell(ledgerStore.activeLedgerId, payload)
      await this.load()
      if (payload.securityId) await this.loadDetail(payload.securityId)
      return result
    },

    async remove(securityId) {
      const ledgerStore = useLedgerStore()
      await removeSecurity(ledgerStore.activeLedgerId, securityId)
      this.detail = null
      await this.load()
    },

    async removeTransaction(transactionId, securityId) {
      const ledgerStore = useLedgerStore()
      await removeSecurityTransaction(ledgerStore.activeLedgerId, transactionId)
      await this.load()
      if (securityId) await this.loadDetail(securityId)
    },
  },
})
