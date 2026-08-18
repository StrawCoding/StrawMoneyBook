import { defineStore } from 'pinia'
import {
  listRecentTransactions,
  listTransactionsByDay,
} from '@/core/repositories/transaction.repo'
import {
  listTransactionsForHome,
  summarizeHomeAssetTotals,
} from '@/core/services/transaction-query.service'
import {
  createExpense,
  createIncome,
  createAdjustment,
  createRefundAdjustment,
  createTransfer,
  updateManualTransaction,
  deleteManualTransaction,
} from '@/core/services/transaction.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { useAccountStore } from '@/ui/stores/account.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useUiStore } from '@/ui/stores/ui.store'
import { translateMessage } from '@/ui/services/i18n.service'

function resolveHomeBudgetDayKey(mode, key, budgetMonthKey = '') {
  const normalizedMode = String(mode ?? '').trim()
  const normalizedKey = String(key ?? '').trim()
  const normalizedBudgetMonthKey = String(budgetMonthKey ?? '').trim()

  if (normalizedMode === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(normalizedKey)) {
    return normalizedKey
  }

  if (
    normalizedMode === 'month'
    && normalizedKey
    && normalizedBudgetMonthKey
    && normalizedKey === normalizedBudgetMonthKey
    && /^\d{4}-\d{2}$/.test(normalizedKey)
  ) {
    const now = new Date()
    const [yearText, monthText] = normalizedKey.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    const daysInMonth = new Date(year, month, 0).getDate()
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
    const day = isCurrentMonth
      ? now.getDate()
      : Math.min(Math.max(1, now.getDate()), daysInMonth)
    return `${yearText}-${monthText}-${String(day).padStart(2, '0')}`
  }

  return ''
}

export const useTransactionStore = defineStore('transaction', {
  state: () => ({
    recent: [],
    homeRecent: [],
    homeFilterMode: '',
    homeFilterKey: '',
    homeTypeFilter: 'all',
    homePage: 1,
    homeTotal: 0,
    homeTotalPages: 1,
    homeIncomeMinor: 0,
    homeExpenseMinor: 0,
    homeBudgetDayTransactions: [],
    homeLoadToken: 0,
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

    async loadHomeAll(page = 1) {
      await this.loadHomeByFilter('all', '', page)
    },

    async loadHomePage(page) {
      if (!this.homeFilterMode) return
      await this.loadHomeByFilter(this.homeFilterMode, this.homeFilterKey, page)
    },

    async loadHomeByFilter(mode, key, page = 1) {
      const ledgerStore = useLedgerStore()
      const ledgerId = ledgerStore.activeLedgerId
      const normalizedMode = ['all', 'year', 'month', 'day'].includes(mode) ? mode : 'month'
      const normalizedKey = String(key ?? '')
      const normalizedPage = Math.max(1, Math.trunc(Number(page)) || 1)

      if (normalizedMode !== 'all' && !normalizedKey) {
        this.homeFilterMode = ''
        this.homeFilterKey = ''
        this.homeRecent = []
        this.homePage = 1
        this.homeTotal = 0
        this.homeTotalPages = 1
        this.homeIncomeMinor = 0
        this.homeExpenseMinor = 0
        this.homeBudgetDayTransactions = []
        return
      }

      const filterChanged = this.homeFilterMode !== normalizedMode || this.homeFilterKey !== normalizedKey
      const targetPage = filterChanged ? 1 : normalizedPage

      this.homeFilterMode = normalizedMode
      this.homeFilterKey = normalizedKey
      if (!ledgerId) return

      const loadToken = this.homeLoadToken + 1
      this.homeLoadToken = loadToken
      this.homeLoading = true
      try {
        const budgetStore = useBudgetStore()
        const [pageResult, assetTotals, budgetDayKey] = await Promise.all([
          listTransactionsForHome(ledgerId, {
            mode: normalizedMode,
            key: normalizedKey,
            page: targetPage,
          }),
          summarizeHomeAssetTotals(ledgerId, {
            mode: normalizedMode,
            key: normalizedKey,
          }),
          Promise.resolve(resolveHomeBudgetDayKey(normalizedMode, normalizedKey, budgetStore.monthKey)),
        ])

        if (this.homeLoadToken !== loadToken) return

        this.homeRecent = pageResult.items ?? []
        this.homePage = pageResult.page ?? targetPage
        this.homeTotal = Number(pageResult.total ?? 0)
        this.homeTotalPages = pageResult.totalPages ?? 1
        this.homeIncomeMinor = Number(assetTotals.incomeMinor ?? 0)
        this.homeExpenseMinor = Number(assetTotals.expenseMinor ?? 0)

        if (budgetDayKey) {
          const dayRows = await listTransactionsByDay(ledgerId, budgetDayKey)
          if (this.homeLoadToken !== loadToken) return
          this.homeBudgetDayTransactions = dayRows
        } else {
          this.homeBudgetDayTransactions = []
        }
      } finally {
        if (this.homeLoadToken === loadToken) {
          this.homeLoading = false
        }
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
      const txId = await createAdjustment(ledgerStore.activeLedgerId, payload)
      await this.refreshAfterWriteSafe()
      return txId
    },

    async addRefund(payload) {
      const ledgerStore = useLedgerStore()
      const txId = await createRefundAdjustment(ledgerStore.activeLedgerId, payload)
      await this.refreshAfterWriteSafe()
      return txId
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
          try {
            useUiStore().pushToast(translateMessage('transaction.refresh_timeout'), 'info')
          } catch {
            // Pinia may be unavailable in isolated unit tests.
          }
          void refreshTask.catch((error) => {
            console.warn('[transaction] background refresh failed', error)
          })
        }
      } catch (error) {
        console.warn('[transaction] refresh after write failed', error)
        try {
          useUiStore().pushToast(translateMessage('transaction.refresh_failed'), 'error')
        } catch {
          // Pinia may be unavailable in isolated unit tests.
        }
      }
    },

    /** ART-10 alias — prefer afterTransactionMutation() from ui/services for cross-store writes. */
    async afterTransactionMutation(timeoutMs = 4500) {
      return this.refreshAfterWriteSafe(timeoutMs)
    },

    async refreshAfterWrite() {
      const accountStore = useAccountStore()
      const budgetStore = useBudgetStore()
      const jobs = [this.loadRecent(), accountStore.load(), budgetStore.loadMonth(budgetStore.monthKey)]

      if (this.homeFilterMode) {
        jobs.push(this.loadHomeByFilter(this.homeFilterMode, this.homeFilterKey, this.homePage))
      }

      await Promise.all(jobs)
    },
  },
})
