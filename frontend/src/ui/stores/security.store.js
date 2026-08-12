import { defineStore } from 'pinia'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import {
  addSecurityBuy,
  addSecuritySell,
  cancelSecuritySettlement,
  confirmSecuritySettlement,
  createSecurityWithOptionalBuy,
  listCandidateSettlementAccounts,
  loadSecuritiesDashboard,
  loadSecurityDetail,
  removeSecurity,
  removeSecurityTransaction,
  rescheduleSecuritySettlement,
  runDueSecuritySettlements,
  setSecuritiesUnrealizedMode,
  updateSecurityEvent,
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
      totalDisplayValueMinor: 0,
      totalDeltaMinor: 0,
    },
    unrealizedMode: 'market',
    /** @deprecated alias of candidateAccounts; kept for callers expecting settlementAccounts */
    settlementAccounts: [],
    candidateAccounts: [],
    detail: null,
    loading: false,
  }),

  actions: {
    async runDueSettlements() {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) return []
      return runDueSecuritySettlements(ledgerStore.activeLedgerId)
    },

    async loadAccounts() {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) return
      // Select-only: any usable asset account may bind as settlement_account_id.
      const candidates = await listCandidateSettlementAccounts(ledgerStore.activeLedgerId)
      this.candidateAccounts = candidates
      this.settlementAccounts = candidates
    },

    async load() {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) return
      this.loading = true
      try {
        await this.runDueSettlements()
        const dashboard = await loadSecuritiesDashboard(ledgerStore.activeLedgerId)
        this.items = dashboard.items
        this.summary = dashboard.summary
        this.unrealizedMode = dashboard.unrealizedMode
        await this.loadAccounts()
      } finally {
        this.loading = false
      }
    },

    async loadDetail(securityId) {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) return null
      await this.runDueSettlements()
      this.detail = await loadSecurityDetail(ledgerStore.activeLedgerId, securityId)
      return this.detail
    },

    async setUnrealizedMode(mode) {
      const ledgerStore = useLedgerStore()
      await setSecuritiesUnrealizedMode(ledgerStore.activeLedgerId, mode)
      await this.load()
      if (this.detail?.security?.id) await this.loadDetail(this.detail.security.id)
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

    async updateEvent(transactionId, payload, securityId) {
      const ledgerStore = useLedgerStore()
      const result = await updateSecurityEvent(ledgerStore.activeLedgerId, transactionId, payload)
      await this.load()
      if (securityId) await this.loadDetail(securityId)
      return result
    },

    async confirmSettlement(transactionId, securityId, options = {}) {
      const ledgerStore = useLedgerStore()
      const result = await confirmSecuritySettlement(ledgerStore.activeLedgerId, transactionId, options)
      await this.load()
      if (securityId) await this.loadDetail(securityId)
      return result
    },

    async cancelSettlement(transactionId, securityId) {
      const ledgerStore = useLedgerStore()
      const result = await cancelSecuritySettlement(ledgerStore.activeLedgerId, transactionId)
      await this.load()
      if (securityId) await this.loadDetail(securityId)
      return result
    },

    async rescheduleSettlement(transactionId, settleAt, securityId) {
      const ledgerStore = useLedgerStore()
      const result = await rescheduleSecuritySettlement(ledgerStore.activeLedgerId, transactionId, settleAt)
      await this.load()
      if (securityId) await this.loadDetail(securityId)
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
