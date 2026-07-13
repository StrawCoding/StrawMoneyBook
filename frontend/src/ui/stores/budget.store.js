import { defineStore } from 'pinia'
import { dateKeyFromDate, monthKeyFromDate } from '@/core/utils/id'
import {
  copyPreviousMonthBudget,
  nextBudgetPeriod,
  previousBudgetPeriod,
  removeBudgetContainer,
  resolveContainerMonthlyAmountMinor,
  resolveContainerPeriodAmountMinor,
  resolveBudgetPeriodForLedger,
  saveBudgetContainer,
  saveBudgetContainerRange,
  saveBudgetSavePreferences as saveBudgetSavePreferencesService,
  saveBudgetTotalConfig as saveBudgetTotalConfigService,
  loadBudgetSnapshot,
  loadBudgetSnapshotForPeriod,
  removeBudgetItem,
  saveBudgetItem,
  saveBudgetItemRange,
  isDailyPoolChildItem,
} from '@/core/services/budget.service'
// computePeriodReservedMinor supersedes computeMonthlyReservedMinor while preserving calendar-month behavior.
import { computePeriodReservedMinor } from '@/core/services/budget-reserve.service'
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

function normalizeContainerPeriodMode(value) {
  return String(value ?? '').trim() === 'daily' ? 'daily' : 'monthly'
}

export const useBudgetStore = defineStore('budget', {
  state: () => ({
    monthKey: monthKeyFromDate(),
    period: null,
    budget: null,
    items: [],
    containers: [],
    spentMap: {},
    todaySpentMap: {},
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
        (total, container) => total + (
          state.period?.key
            ? resolveContainerPeriodAmountMinor(container, state.period)
            : resolveContainerMonthlyAmountMinor(container, state.monthKey)
        ),
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
        const isDailyPool = normalizeContainerPeriodMode(container.period_mode) === 'daily'
        const spentMinor = childItems.reduce(
          (total, item) => total + toFiniteMinor(
            isDailyPool
              ? state.todaySpentMap[item.category_id]
              : state.spentMap[item.category_id],
          ),
          0,
        )
        const amountMinor = toFiniteMinor(container.amount_minor)
        const budgetMinor = isDailyPool
          ? amountMinor
          : (state.period?.key
            ? resolveContainerPeriodAmountMinor(container, state.period)
            : resolveContainerMonthlyAmountMinor(container, state.monthKey))
        return {
          ...container,
          items: childItems,
          periodMode: normalizeContainerPeriodMode(container.period_mode),
          spentMinor,
          budgetMinor,
          remainMinor: budgetMinor - spentMinor,
          isOver: budgetMinor > 0 && spentMinor > budgetMinor,
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
        computePeriodReservedMinor(
          reserveItems,
          state.containers,
          state.period ?? { key: state.monthKey, monthKey: state.monthKey },
          referenceDate,
          timeZone,
          options,
        )
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
      if (isDailyPoolChildItem(item, this.containers)) {
        const containerId = String(item?.budget_container_id ?? '').trim()
        return this.isContainerOver(containerId)
      }
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
      await this.loadCurrentPeriod()
    },

    async loadCurrentPeriod() {
      const ledgerStore = useLedgerStore()
      const period = resolveBudgetPeriodForLedger(ledgerStore.activeLedger, dateKeyFromDate())
      await this.loadPeriod(period)
    },

    async loadMonth(monthKey) {
      const ledgerStore = useLedgerStore()
      if (String(ledgerStore.activeLedger?.budget_period_mode ?? '') === 'pay_cycle') {
        await this.loadPeriod(resolveBudgetPeriodForLedger(ledgerStore.activeLedger, `${monthKey}-01`))
        return
      }
      await this.loadPeriod(resolveBudgetPeriodForLedger(ledgerStore.activeLedger, monthKey))
    },

    async loadPeriod(period) {
      const ledgerStore = useLedgerStore()
      const ledgerId = ledgerStore.activeLedgerId
      if (!ledgerId) return

      this.period = period
      this.monthKey = period.monthKey ?? period.key
      this.loading = true

      try {
        const snapshot = period?.mode === 'pay_cycle'
          ? await loadBudgetSnapshotForPeriod(ledgerId, period)
          : await loadBudgetSnapshot(ledgerId, period.monthKey ?? period.key)
        this.budget = snapshot.budget
        this.period = snapshot.period ?? period
        this.monthKey = this.period.monthKey ?? this.period.key
        this.items = snapshot.items
        this.containers = snapshot.containers ?? []
        this.budgetSavePreferences = snapshot.budgetSavePreferences ?? { retroactiveMode: 'manual' }

        const spentMap = {}
        for (const row of snapshot.spentRows) {
          if (!row.category_id) continue
          spentMap[row.category_id] = toFiniteMinor(row.spent_minor)
        }

        const todaySpentMap = {}
        for (const row of snapshot.todaySpentRows ?? []) {
          if (!row.category_id) continue
          todaySpentMap[row.category_id] = toFiniteMinor(row.spent_minor)
        }

        this.spentMap = spentMap
        this.todaySpentMap = todaySpentMap
      } finally {
        this.loading = false
      }
    },

    async upsertItem(payload) {
      const ledgerStore = useLedgerStore()
      const applyThroughMonth = String(payload?.applyThroughMonth ?? '').trim()
      if (this.period?.mode !== 'pay_cycle' && applyThroughMonth && !payload?.id) {
        await saveBudgetItemRange(ledgerStore.activeLedgerId, this.monthKey, applyThroughMonth, payload)
      } else {
        await saveBudgetItem(ledgerStore.activeLedgerId, this.period ?? this.monthKey, payload)
      }
      await this.loadPeriod(this.period)
    },

    async upsertContainer(payload) {
      const ledgerStore = useLedgerStore()
      const applyThroughMonth = String(payload?.applyThroughMonth ?? '').trim()
      if (this.period?.mode !== 'pay_cycle' && applyThroughMonth && !payload?.id) {
        await saveBudgetContainerRange(ledgerStore.activeLedgerId, this.monthKey, applyThroughMonth, payload)
      } else {
        await saveBudgetContainer(ledgerStore.activeLedgerId, this.period ?? this.monthKey, payload)
      }
      await this.loadPeriod(this.period)
    },

    async deleteContainer(containerId) {
      const ledgerStore = useLedgerStore()
      await removeBudgetContainer(ledgerStore.activeLedgerId, containerId)
      await this.loadPeriod(this.period)
    },

    async saveTotalBudgetSave(payload) {
      const ledgerStore = useLedgerStore()
      await saveBudgetTotalConfigService(ledgerStore.activeLedgerId, this.period ?? this.monthKey, payload)
      await this.loadPeriod(this.period)
    },

    async saveBudgetSavePreferences(payload) {
      const ledgerStore = useLedgerStore()
      this.budgetSavePreferences = await saveBudgetSavePreferencesService(ledgerStore.activeLedgerId, payload)
    },

    async deleteItem(itemId) {
      const ledgerStore = useLedgerStore()
      await removeBudgetItem(ledgerStore.activeLedgerId, itemId)
      await this.loadPeriod(this.period)
    },

    async copyFromPreviousMonth() {
      const ledgerStore = useLedgerStore()
      const result = await copyPreviousMonthBudget(ledgerStore.activeLedgerId, this.monthKey, {
        replaceExisting: true,
      })
      await this.loadPeriod(this.period)
      return result
    },

    async goPreviousPeriod() {
      const ledgerStore = useLedgerStore()
      const next = previousBudgetPeriod(this.period ?? resolveBudgetPeriodForLedger(ledgerStore.activeLedger, this.monthKey), ledgerStore.activeLedger)
      await this.loadPeriod(next)
    },

    async goNextPeriod() {
      const ledgerStore = useLedgerStore()
      const next = nextBudgetPeriod(this.period ?? resolveBudgetPeriodForLedger(ledgerStore.activeLedger, this.monthKey), ledgerStore.activeLedger)
      await this.loadPeriod(next)
    },
  },
})
