import { defineStore } from 'pinia'
import {
  listAccountGroups,
  listAccounts,
  getAccountBalances,
  createAccountGroup,
  createAccount,
  deleteAccountGroupIfEmpty,
  deleteAccountIfUnused,
  updateAccountGroupSortOrders,
  updateAccountSortOrdersByGroup,
  updateAccountIcon as updateAccountIconRepo,
  updateAccountProfile as updateAccountProfileRepo,
  updateAccountGroupProfile as updateAccountGroupProfileRepo,
} from '@/core/repositories/account.repo'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { assertCanCreateAccount } from '@/core/services/membership.service'
import { buildGroupSummaries } from '@/ui/utils/account-group-summary'

function isIncludedInAssets(account) {
  return Number(account?.include_in_assets ?? 1) === 1
}

function isSavingsJarAccount(account) {
  return Boolean(String(account?.savings_jar_goal_type ?? '').trim())
}

function buildGroupedAccounts(groups, accounts, { includeSavings = true } = {}) {
  const filteredAccounts = includeSavings
    ? [...(accounts ?? [])]
    : (accounts ?? []).filter((account) => !isSavingsJarAccount(account))

  const accountsByGroupId = new Map()
  for (const account of filteredAccounts) {
    const groupId = account.group_id
    if (!accountsByGroupId.has(groupId)) {
      accountsByGroupId.set(groupId, [])
    }
    accountsByGroupId.get(groupId).push(account)
  }

  const grouped = []
  const includedGroupIds = new Set()
  for (const group of groups ?? []) {
    const groupAccounts = accountsByGroupId.get(group.id) ?? []
    if (!groupAccounts.length) continue

    grouped.push({
      ...group,
      options: groupAccounts.map((account) => ({
        value: account.id,
        label: account.name,
        icon: account.icon,
      })),
    })
    includedGroupIds.add(group.id)
  }

  const orphanAccounts = filteredAccounts.filter((account) => !includedGroupIds.has(account.group_id))
  if (orphanAccounts.length) {
    grouped.push({
      id: '__ungrouped__',
      name: '未分組',
      options: orphanAccounts.map((account) => ({
        value: account.id,
        label: account.name,
        icon: account.icon,
      })),
    })
  }

  return grouped
}

export const useAccountStore = defineStore('account', {
  state: () => ({
    groups: [],
    accounts: [],
    balances: [],
    loading: false,
    ready: false,
  }),

  getters: {
    groupSummaries(state) {
      return buildGroupSummaries(state.groups, state.accounts, state.balances)
    },

    totalAssetsMinor(state) {
      const includeMap = new Map(state.accounts.map((item) => [item.id, isIncludedInAssets(item)]))
      return state.balances.reduce((total, item) => {
        if (includeMap.get(item.id) === false) return total
        return total + Number(item.balance_minor ?? 0)
      }, 0)
    },

    regularAccounts(state) {
      return state.accounts.filter((item) => !isSavingsJarAccount(item))
    },

    savingsJarAccounts(state) {
      return state.accounts.filter((item) => isSavingsJarAccount(item))
    },

    groupedAccounts(state) {
      return buildGroupedAccounts(state.groups, state.accounts)
    },

    groupedRegularAccounts(state) {
      return buildGroupedAccounts(state.groups, state.accounts, { includeSavings: false })
    },
  },

  actions: {
    async load(options = {}) {
      const ledgerStore = useLedgerStore()
      const ledgerId = ledgerStore.activeLedgerId

      this.loading = true
      try {
        if (!ledgerId) {
          this.groups = []
          this.accounts = []
          this.balances = []
          return
        }
        const includeArchived = Boolean(options.includeArchived)
        const [groups, accounts, balances] = await Promise.all([
          listAccountGroups(ledgerId),
          listAccounts(ledgerId, { includeArchived }),
          getAccountBalances(ledgerId, { includeArchived }),
        ])

        this.groups = groups
        this.accounts = accounts
        this.balances = balances
      } finally {
        this.ready = true
        this.loading = false
      }
    },

    async addGroup(payload) {
      const ledgerStore = useLedgerStore()
      await createAccountGroup(ledgerStore.activeLedgerId, payload)
      await this.load()
    },

    async addAccount(payload) {
      const ledgerStore = useLedgerStore()
      const existingAccounts = await listAccounts(ledgerStore.activeLedgerId)
      assertCanCreateAccount(existingAccounts.filter((item) => !isSavingsJarAccount(item)).length)
      await createAccount(ledgerStore.activeLedgerId, payload)
      await this.load()
    },

    async removeGroup(groupId) {
      const ledgerStore = useLedgerStore()
      await deleteAccountGroupIfEmpty(ledgerStore.activeLedgerId, groupId)
      await this.load()
    },

    async removeAccount(accountId) {
      if (this.accounts.length <= 1) {
        throw new Error('至少需要保留一個帳戶')
      }
      const target = this.accounts.find((item) => item.id === accountId)
      const remainingRegularCount = this.accounts.filter((item) => !isSavingsJarAccount(item) && item.id !== accountId).length
      if (!isSavingsJarAccount(target) && remainingRegularCount <= 0) {
        throw new Error('至少需要保留一個可交易帳戶')
      }
      const ledgerStore = useLedgerStore()
      await deleteAccountIfUnused(ledgerStore.activeLedgerId, accountId)
      await this.load()
    },

    async reorderGroups(groupIds) {
      const ledgerStore = useLedgerStore()
      await updateAccountGroupSortOrders(ledgerStore.activeLedgerId, groupIds)
      await this.load()
    },

    async reorderAccounts(groupId, accountIds) {
      const ledgerStore = useLedgerStore()
      await updateAccountSortOrdersByGroup(ledgerStore.activeLedgerId, groupId, accountIds)
      await this.load()
    },

    async updateAccountIcon(accountId, icon) {
      const ledgerStore = useLedgerStore()
      await updateAccountIconRepo(ledgerStore.activeLedgerId, accountId, icon)
      await this.load()
    },

    async updateAccountProfile(accountId, payload) {
      const ledgerStore = useLedgerStore()
      await updateAccountProfileRepo(ledgerStore.activeLedgerId, accountId, payload)
      await this.load()
    },

    async updateAccountGroupProfile(groupId, payload) {
      const ledgerStore = useLedgerStore()
      await updateAccountGroupProfileRepo(ledgerStore.activeLedgerId, groupId, payload)
      await this.load()
    },
  },
})
