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
} from '@/core/repositories/account.repo'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { assertCanCreateAccount } from '@/core/services/membership.service'

export const useAccountStore = defineStore('account', {
  state: () => ({
    groups: [],
    accounts: [],
    balances: [],
    loading: false,
  }),

  getters: {
    groupSummaries(state) {
      const balanceMap = new Map(state.balances.map((item) => [item.id, Number(item.balance_minor)]))
      const accountsByGroup = new Map()

      for (const account of state.accounts) {
        const groupId = account.group_id
        if (!accountsByGroup.has(groupId)) {
          accountsByGroup.set(groupId, [])
        }
        accountsByGroup.get(groupId).push(account)
      }

      return state.groups.map((group) => {
        const groupAccounts = accountsByGroup.get(group.id) ?? []
        const totalMinor = groupAccounts.reduce((total, account) => {
          return total + (balanceMap.get(account.id) ?? Number(account.opening_balance_minor ?? 0))
        }, 0)

        return {
          ...group,
          accountCount: groupAccounts.length,
          totalMinor,
        }
      })
    },

    totalAssetsMinor(state) {
      return state.balances.reduce((total, item) => total + Number(item.balance_minor ?? 0), 0)
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
        const [groups, accounts, balances] = await Promise.all([
          listAccountGroups(ledgerId),
          listAccounts(ledgerId, { includeArchived }),
          getAccountBalances(ledgerId, { includeArchived }),
        ])

        this.groups = groups
        this.accounts = accounts
        this.balances = balances
      } finally {
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
      assertCanCreateAccount(existingAccounts.length)
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
  },
})
