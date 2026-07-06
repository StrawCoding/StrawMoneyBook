import { defineStore } from 'pinia'
import { monthKeyFromDate } from '@/core/utils/id'
import {
  copyPreviousMonthBudget,
  removeBudgetContainer,
  saveBudgetContainer,
  saveBudgetSavePreferences as saveBudgetSavePreferencesService,
  saveBudgetTotalConfig as saveBudgetTotalConfigService,
  loadBudgetSnapshot,
  removeBudgetItem,
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

function itemResolvedMinor(item) {
  return toFiniteMinor(item?.resolved_amount_minor ?? item?.amount_minor)
}

function isItemInContainer(item) {
  return Boolean(String(item?.budget_container_id ?? '').trim())
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
    unassignedItems(state) {
      return state.items.filter((item) => !isItemInContainer(item))
    },

    totalBudgetMinor(state) {
      const containerTotal = state.containers.reduce(
        (total, container) => total + toFiniteMinor(container.amount_minor),
        0,
      )
      const unassignedTotal = state.items
        .filter((item) => !isItemInContainer(item))
        .reduce((total, item) => total + itemResolvedMinor(item), 0)
      return containerTotal + unassignedTotal
    },

    totalSpentMinor(state) {
      const budgetedCategoryIds = new Set(
        state.items
          .map((item) => item.category_id)
          .filter((categoryId) => Boolean(categoryId)),
      )

      let total = 0
      for (const categoryId of budgetedCategoryIds) {
        total += toFiniteMinor(state.spentMap[categoryId])
      }
      return total
    },

    remainMinor() {
      return this.totalBudgetMinor - this.totalSpentMinor
    },

    isMonthOver() {
      return this.totalBudgetMinor > 0 && this.totalSpentMinor > this.totalBudgetMinor
    },

    containersWithStats(state) {
      return state.containers.map((container) => {
        const childItems = state.items.filter(
          (item) => String(item?.budget_container_id ?? '') === String(container.id),
        )
        const spentMinor = childItems.reduce(
          (total, item) => total + toFiniteMinor(state.spentMap[item.category_id]),
          0,
        )
        const amountMinor = toFiniteMinor(container.amount_minor)
        return {
          ...container,
          items: childItems,
          spentMinor,
          remainMinor: amountMinor - spentMinor,
          isOver: amountMinor > 0 && spentMinor > amountMinor,
        }
      })
    },

    groupedBudgetSections() {
      const sections = this.containersWithStats.map((container) => ({
        type: 'container',
        container,
        items: container.items,
      }))
      const unassigned = this.unassignedItems
      if (unassigned.length > 0) {
        sections.push({
          type: 'unassigned',
          container: null,
          items: unassigned,
        })
      }
      return sections
    },

    reservedMinorByDate(state) {
      const ledgerStore = useLedgerStore()
      const timeZone = normalizeTimeZone(ledgerStore.activeLedger?.timezone)
      const reserveItems = state.items.filter((item) => !isItemInContainer(item))
      return (referenceDate = new Date(), options = {}) => (
        computeReservedMinor(reserveItems, state.monthKey, referenceDate, timeZone, options)
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
    itemSpentMinor(categoryId) {
      return toFiniteMinor(this.spentMap[categoryId])
    },

    itemResolvedMinor(item) {
      return itemResolvedMinor(item)
    },

    isItemOver(item) {
      const budgetMinor = itemResolvedMinor(item)
      if (budgetMinor <= 0) return false
      return this.itemSpentMinor(item?.category_id) > budgetMinor
    },

    isContainerOver(containerId) {
      const container = this.containersWithStats.find(
        (entry) => String(entry.id) === String(containerId),
      )
      return Boolean(container?.isOver)
    },

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
          if (!row.category_id) continue
          spentMap[row.category_id] = toFiniteMinor(row.spent_minor)
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

    async deleteContainer(containerId) {
      const ledgerStore = useLedgerStore()
      await removeBudgetContainer(ledgerStore.activeLedgerId, containerId)
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
