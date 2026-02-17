import { defineStore } from 'pinia'
import {
  listCategoryGroups,
  listCategories,
  createCategoryGroup,
  createCategory,
  deleteCategoryIfUnused,
  deleteCategoryGroupIfUnused,
  findFirstCategoryByKind,
  updateCategoryGroupSortOrdersByKind,
  updateCategorySortOrdersByGroup,
  updateCategoryIcon as updateCategoryIconRepo,
  updateCategoryProfile as updateCategoryProfileRepo,
} from '@/core/repositories/category.repo'
import { useLedgerStore } from '@/ui/stores/ledger.store'

function buildCategoryGroupsByKind(groups, categories, kind) {
  const filteredCategories = categories.filter((category) => category.kind === kind || category.kind === 'both')
  const categoriesByGroupId = new Map()
  for (const category of filteredCategories) {
    const groupId = category.group_id
    if (!categoriesByGroupId.has(groupId)) {
      categoriesByGroupId.set(groupId, [])
    }
    categoriesByGroupId.get(groupId).push(category)
  }

  const grouped = []
  const includedGroupIds = new Set()
  for (const group of groups) {
    if (group.kind !== kind && group.kind !== 'both') continue
    const groupCategories = categoriesByGroupId.get(group.id) ?? []
    if (!groupCategories.length) continue

    grouped.push({
      ...group,
      categories: groupCategories,
    })
    includedGroupIds.add(group.id)
  }

  const orphanCategories = filteredCategories.filter((category) => !includedGroupIds.has(category.group_id))

  if (orphanCategories.length > 0) {
    grouped.push({
      id: '__ungrouped__',
      name: '未分組',
      kind,
      categories: orphanCategories,
    })
  }

  return grouped
}

export const useCategoryStore = defineStore('category', {
  state: () => ({
    groups: [],
    categories: [],
    loading: false,
  }),

  getters: {
    expenseCategories(state) {
      return state.categories.filter((category) => category.kind === 'expense' || category.kind === 'both')
    },

    incomeCategories(state) {
      return state.categories.filter((category) => category.kind === 'income' || category.kind === 'both')
    },

    expenseCategoryGroups(state) {
      return buildCategoryGroupsByKind(state.groups, state.categories, 'expense')
    },

    incomeCategoryGroups(state) {
      return buildCategoryGroupsByKind(state.groups, state.categories, 'income')
    },
  },

  actions: {
    async load(options = {}) {
      const ledgerStore = useLedgerStore()
      const ledgerId = ledgerStore.activeLedgerId
      if (!ledgerId) return

      this.loading = true
      try {
        const includeArchived = Boolean(options.includeArchived)
        const [groups, categories] = await Promise.all([
          listCategoryGroups(ledgerId),
          listCategories(ledgerId, { includeArchived }),
        ])

        this.groups = groups
        this.categories = categories
      } finally {
        this.loading = false
      }
    },

    async addGroup(payload) {
      const ledgerStore = useLedgerStore()
      await createCategoryGroup(ledgerStore.activeLedgerId, payload)
      await this.load()
    },

    async addCategory(payload) {
      const ledgerStore = useLedgerStore()
      await createCategory(ledgerStore.activeLedgerId, payload)
      await this.load()
    },

    async removeCategory(categoryId) {
      const ledgerStore = useLedgerStore()
      await deleteCategoryIfUnused(ledgerStore.activeLedgerId, categoryId)
      await this.load()
    },

    async removeGroup(groupId) {
      const ledgerStore = useLedgerStore()
      await deleteCategoryGroupIfUnused(ledgerStore.activeLedgerId, groupId)
      await this.load()
    },

    async reorderGroups(kind, groupIds) {
      const ledgerStore = useLedgerStore()
      await updateCategoryGroupSortOrdersByKind(ledgerStore.activeLedgerId, kind, groupIds)
      await this.load()
    },

    async reorderCategories(groupId, categoryIds) {
      const ledgerStore = useLedgerStore()
      await updateCategorySortOrdersByGroup(ledgerStore.activeLedgerId, groupId, categoryIds)
      await this.load()
    },

    async updateCategoryIcon(categoryId, icon) {
      const ledgerStore = useLedgerStore()
      await updateCategoryIconRepo(ledgerStore.activeLedgerId, categoryId, icon)
      await this.load()
    },

    async updateCategoryProfile(categoryId, payload) {
      const ledgerStore = useLedgerStore()
      await updateCategoryProfileRepo(ledgerStore.activeLedgerId, categoryId, payload)
      await this.load()
    },

    async pickDefaultCategory(kind) {
      const ledgerStore = useLedgerStore()
      return findFirstCategoryByKind(ledgerStore.activeLedgerId, kind)
    },
  },
})
