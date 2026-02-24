import { defineStore } from 'pinia'
import {
  listRecentTransactions,
  listTransactionsByMonth,
  listTransactionsByYear,
  listTransactionsByDay,
  listAllTransactions,
} from '@/core/repositories/transaction.repo'
import {
  createExpense,
  createIncome,
  createAdjustment,
  createTransfer,
  updateManualTransaction,
  deleteManualTransaction,
} from '@/core/services/transaction.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useBudgetStore } from '@/ui/stores/budget.store'

function includeInAnalysisOnHome(tx) {
  return Number(tx?.include_in_analysis ?? 1) !== 0
}

function filterHomeTransactions(rows) {
  return Array.isArray(rows) ? rows.filter((tx) => includeInAnalysisOnHome(tx)) : []
}

export const useTransactionStore = defineStore('transaction', {
  state: () => ({
    recent: [],
    homeRecent: [],
    homeFilterMode: '',
    homeFilterKey: '',
    homeTypeFilter: 'all',
    loading: false,
    homeLoading: false,
    filter: {
      accountId: '',
      categoryId: '',
      monthKey: '',
      minMinor: null,
      maxMinor: null,
    },
  }),

  actions: {
    setHomeTypeFilter(type) {
      const normalized = type === 'income' || type === 'expense' ? type : 'all'
      this.homeTypeFilter = normalized
    },

    async loadRecent(limit = 30) {
      const ledgerStore = useLedgerStore()
      const ledgerId = ledgerStore.activeLedgerId
      if (!ledgerId) return

      this.loading = true
      try {
        this.recent = await listRecentTransactions(ledgerId, limit)
      } finally {
        this.loading = false
      }
    },

    async loadHomeMonth(monthKey) {
      await this.loadHomeByFilter('month', monthKey)
    },

    async loadHomeYear(yearKey) {
      await this.loadHomeByFilter('year', yearKey)
    },

    async loadHomeDay(dayKey) {
      await this.loadHomeByFilter('day', dayKey)
    },

    async loadHomeAll() {
      await this.loadHomeByFilter('all', '')
    },

    async loadHomeByFilter(mode, key) {
      const ledgerStore = useLedgerStore()
      const ledgerId = ledgerStore.activeLedgerId
      const normalizedMode = ['all', 'year', 'month', 'day'].includes(mode) ? mode : 'month'
      const normalizedKey = String(key ?? '')

      if (normalizedMode !== 'all' && !normalizedKey) {
        this.homeFilterMode = ''
        this.homeFilterKey = ''
        this.homeRecent = []
        return
      }

      this.homeFilterMode = normalizedMode
      this.homeFilterKey = normalizedKey
      if (!ledgerId) return

      this.homeLoading = true
      try {
        if (normalizedMode === 'all') {
          this.homeRecent = filterHomeTransactions(await listAllTransactions(ledgerId))
          return
        }
        if (normalizedMode === 'year') {
          this.homeRecent = filterHomeTransactions(await listTransactionsByYear(ledgerId, normalizedKey))
          return
        }
        if (normalizedMode === 'day') {
          this.homeRecent = filterHomeTransactions(await listTransactionsByDay(ledgerId, normalizedKey))
          return
        }
        this.homeRecent = filterHomeTransactions(await listTransactionsByMonth(ledgerId, normalizedKey))
      } finally {
        this.homeLoading = false
      }
    },

    async addExpense(payload) {
      const ledgerStore = useLedgerStore()
      const txId = await createExpense(ledgerStore.activeLedgerId, payload)
      await this.refreshAfterWriteSafe()
      return txId
    },

    async addIncome(payload) {
      const ledgerStore = useLedgerStore()
      const txId = await createIncome(ledgerStore.activeLedgerId, payload)
      await this.refreshAfterWriteSafe()
      return txId
    },

    async addAdjustment(payload) {
      const ledgerStore = useLedgerStore()
      await createAdjustment(ledgerStore.activeLedgerId, payload)
      await this.refreshAfterWriteSafe()
    },

    async addTransfer(payload) {
      const ledgerStore = useLedgerStore()
      const transferResult = await createTransfer(ledgerStore.activeLedgerId, payload)
      await this.refreshAfterWriteSafe()
      return transferResult
    },

    async updateTransaction(txId, payload) {
      const ledgerStore = useLedgerStore()
      await updateManualTransaction(ledgerStore.activeLedgerId, txId, payload)
      await this.refreshAfterWriteSafe()
    },

    async deleteTransaction(txId) {
      const ledgerStore = useLedgerStore()
      await deleteManualTransaction(ledgerStore.activeLedgerId, txId)
      await this.refreshAfterWriteSafe()
    },

    async deleteTransactionsBatch(txIds = []) {
      const ledgerStore = useLedgerStore()
      const ledgerId = ledgerStore.activeLedgerId
      const ids = Array.from(new Set((txIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)))
      if (!ledgerId || !ids.length) {
        return { deleted: 0, failed: [] }
      }

      let deleted = 0
      const failed = []
      for (const txId of ids) {
        try {
          await deleteManualTransaction(ledgerId, txId)
          deleted += 1
        } catch (error) {
          failed.push({
            txId,
            message: String(error?.message ?? error ?? '刪除失敗'),
          })
        }
      }

      await this.refreshAfterWriteSafe()
      return { deleted, failed }
    },

    async refreshAfterWriteSafe(timeoutMs = 4500) {
      const refreshTask = this.refreshAfterWrite()
      const normalizedTimeoutMs = Math.max(0, Number(timeoutMs) || 0)

      if (normalizedTimeoutMs === 0) {
        try {
          await refreshTask
        } catch (error) {
          console.warn('[transaction] refresh after write failed', error)
        }
        return
      }

      const timeoutTask = new Promise((resolve) => {
        setTimeout(() => resolve('timeout'), normalizedTimeoutMs)
      })

      try {
        const result = await Promise.race([
          refreshTask.then(() => 'done'),
          timeoutTask,
        ])

        if (result === 'timeout') {
          console.warn('[transaction] refresh after write timed out, continue in background')
          void refreshTask.catch((error) => {
            console.warn('[transaction] background refresh failed', error)
          })
        }
      } catch (error) {
        console.warn('[transaction] refresh after write failed', error)
      }
    },

    async refreshAfterWrite() {
      const accountStore = useAccountStore()
      const budgetStore = useBudgetStore()
      const jobs = [this.loadRecent(), accountStore.load(), budgetStore.loadMonth(budgetStore.monthKey)]

      if (this.homeFilterMode) {
        jobs.push(this.loadHomeByFilter(this.homeFilterMode, this.homeFilterKey))
      }

      await Promise.all(jobs)
    },
  },
})
