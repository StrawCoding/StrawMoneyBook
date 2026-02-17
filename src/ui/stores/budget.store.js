import { defineStore } from 'pinia'
import { monthKeyFromDate } from '@/core/utils/id'
import {
  copyPreviousMonthBudget,
  loadBudgetSnapshot,
  removeBudgetItem,
  saveBudgetItem,
} from '@/core/services/budget.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'

export const useBudgetStore = defineStore('budget', {
  state: () => ({
    monthKey: monthKeyFromDate(),
    budget: null,
    items: [],
    spentMap: {},
    loading: false,
  }),

  getters: {
    totalBudgetMinor(state) {
      return state.items.reduce((total, item) => total + Number(item.amount_minor ?? 0), 0)
    },

    totalSpentMinor(state) {
      const budgetedCategoryIds = new Set(
        state.items
          .map((item) => item.category_id)
          .filter((categoryId) => Boolean(categoryId)),
      )

      let total = 0
      for (const categoryId of budgetedCategoryIds) {
        total += Number(state.spentMap[categoryId] ?? 0)
      }
      return total
    },

    remainMinor() {
      return this.totalBudgetMinor - this.totalSpentMinor
    },
  },

  actions: {
    async loadCurrentMonth() {
      await this.loadMonth(monthKeyFromDate())
    },

    async loadMonth(monthKey) {
      const ledgerStore = useLedgerStore()
      const ledgerId = ledgerStore.activeLedgerId
      if (!ledgerId) return

      this.monthKey = monthKey
      this.loading = true

      try {
        const snapshot = await loadBudgetSnapshot(ledgerId, monthKey)
        this.budget = snapshot.budget
        this.items = snapshot.items

        const spentMap = {}
        for (const row of snapshot.spentRows) {
          if (!row.category_id) continue
          spentMap[row.category_id] = Number(row.spent_minor)
        }

        this.spentMap = spentMap
      } finally {
        this.loading = false
      }
    },

    async upsertItem(payload) {
      const ledgerStore = useLedgerStore()
      await saveBudgetItem(ledgerStore.activeLedgerId, this.monthKey, payload)
      await this.loadMonth(this.monthKey)
    },

    async deleteItem(itemId) {
      const ledgerStore = useLedgerStore()
      await removeBudgetItem(ledgerStore.activeLedgerId, itemId)
      await this.loadMonth(this.monthKey)
    },

    async copyFromPreviousMonth() {
      const ledgerStore = useLedgerStore()
      const result = await copyPreviousMonthBudget(ledgerStore.activeLedgerId, this.monthKey, {
        replaceExisting: true,
      })
      await this.loadMonth(this.monthKey)
      return result
    },
  },
})
