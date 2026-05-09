import { defineStore } from 'pinia'
import { monthKeyFromDate } from '@/core/utils/id'
import {
  copyPreviousMonthBudget,
  saveBudgetSavePreferences as saveBudgetSavePreferencesService,
  saveBudgetTotalConfig as saveBudgetTotalConfigService,
  loadBudgetSnapshot,
  removeBudgetItem,
  removeBudgetContainer,
  saveBudgetContainer,
  saveBudgetItem,
} from '@/core/services/budget.service'
import { computeReservedMinor } from '@/core/services/budget-reserve.service'
import { useLedgerStore } from '@/ui/stores/ledger.store'

function toFiniteMinor(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return numeric
}

function normalizeTimeZone(value) {
  const timeZone = String(value ?? '').trim()
  if (!timeZone) return 'Asia/Taipei'
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date('2026-01-01T00:00:00.000Z'))
    return timeZone
  } catch {
    return 'Asia/Taipei'
  }
}

export const useBudgetStore = defineStore('budget', {
  state: () => ({
    monthKey: monthKeyFromDate(),
    budget: null,
    items: [],
    containers: [],
    spentMap: {},
    budgetSavePreferences: {
      retroactiveMode: 'manual',
    },
    loading: false,
  }),

  getters: {
    totalBudgetMinor(state) {
      const containedIds = new Set(state.containers.map((container) => String(container.id)))
      const containerBudget = state.containers.reduce((total, container) => total + toFiniteMinor(container.amount_minor), 0)
      const ungroupedBudget = state.items
        .filter((item) => !containedIds.has(String(item.budget_container_id ?? '')))
        .reduce((total, item) => total + toFiniteMinor(item.resolved_amount_minor ?? item.amount_minor), 0)
      return containerBudget + ungroupedBudget
    },

    totalSpentMinor(state) {
      const budgetedCategoryIds = new Set(state.items.map((item) => item.category_id).filter(Boolean))

      let total = 0
      for (const categoryId of budgetedCategoryIds) {
        total += toFiniteMinor(state.spentMap[categoryId])
      }
      return total
    },

    remainMinor() {
      return this.totalBudgetMinor - this.totalSpentMinor
    },

    reservedMinorByDate(state) {
      const ledgerStore = useLedgerStore()
      const timeZone = normalizeTimeZone(ledgerStore.activeLedger?.timezone)
      return (referenceDate = new Date(), options = {}) => (
        computeReservedMinor(state.items, state.monthKey, referenceDate, timeZone, options)
      )
    },

    reservedMinor() {
      return this.reservedMinorByDate(new Date(), { includeReferenceDay: true })
    },

    dailyReservedMinor() {
      return this.reservedMinorByDate(new Date(), { includeReferenceDay: false })
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
        this.containers = snapshot.containers ?? []
        this.budgetSavePreferences = snapshot.budgetSavePreferences ?? { retroactiveMode: 'manual' }

        const spentMap = {}
        for (const row of snapshot.spentRows) {
          const spentMinor = toFiniteMinor(row.spent_minor)
          if (row.category_id) {
            spentMap[row.category_id] = spentMinor
          }
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

    async upsertContainer(payload) {
      const ledgerStore = useLedgerStore()
      await saveBudgetContainer(ledgerStore.activeLedgerId, this.monthKey, payload)
      await this.loadMonth(this.monthKey)
    },

    async saveTotalBudgetSave(payload) {
      const ledgerStore = useLedgerStore()
      await saveBudgetTotalConfigService(ledgerStore.activeLedgerId, this.monthKey, payload)
      await this.loadMonth(this.monthKey)
    },

    async saveBudgetSavePreferences(payload) {
      const ledgerStore = useLedgerStore()
      this.budgetSavePreferences = await saveBudgetSavePreferencesService(ledgerStore.activeLedgerId, payload)
    },

    async deleteItem(itemId) {
      const ledgerStore = useLedgerStore()
      await removeBudgetItem(ledgerStore.activeLedgerId, itemId)
      await this.loadMonth(this.monthKey)
    },

    async deleteContainer(containerId) {
      const ledgerStore = useLedgerStore()
      await removeBudgetContainer(ledgerStore.activeLedgerId, containerId)
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
