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
import { convertBalanceToTargetCurrency } from '@/core/utils/fx-convert.js'
import { buildGroupSummaries } from '@/ui/utils/account-group-summary'
import { getExchangeRateSnapshot } from '@/ui/services/exchange-rate.service'

function isIncludedInAssets(account) {
  return Number(account?.include_in_assets ?? 1) === 1
}

function isSavingsJarAccount(account) {
  return Boolean(String(account?.savings_jar_goal_type ?? '').trim())
}

function isCreditAccount(account) {
  return String(account?.account_kind ?? '').trim().toLowerCase() === 'credit'
}

function buildGroupedAccounts(groups, accounts, { includeSavings = true, includeCredit = true, creditGroupLabel = '信用卡' } = {}) {
  const filteredAccounts = includeSavings
    ? [...(accounts ?? [])]
    : (accounts ?? []).filter((account) => !isSavingsJarAccount(account))

  const cashAccounts = filteredAccounts.filter((account) => !isCreditAccount(account))
  const creditAccounts = includeCredit
    ? filteredAccounts.filter((account) => isCreditAccount(account))
    : []

  const accountsByGroupId = new Map()
  for (const account of cashAccounts) {
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

  const orphanAccounts = cashAccounts.filter((account) => !includedGroupIds.has(account.group_id))
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

  // 信用卡不掛在現金母分類下；獨立「信用卡」區供記帳選用
  if (creditAccounts.length) {
    grouped.push({
      id: '__credit_cards__',
      name: creditGroupLabel,
      options: creditAccounts.map((account) => ({
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
    exchangeRateSnapshot: null,
    loading: false,
    ready: false,
    loadRequestSeq: 0,
  }),

  getters: {
    groupSummaries(state) {
      const ledgerStore = useLedgerStore()
      return buildGroupSummaries(state.groups, state.accounts, state.balances, {
        targetCurrencyCode: ledgerStore.activeLedger?.currency_code ?? 'TWD',
        rates: state.exchangeRateSnapshot?.rates ?? {},
      })
    },

    totalAssetsMinor(state) {
      const ledgerStore = useLedgerStore()
      const targetCurrencyCode = ledgerStore.activeLedger?.currency_code ?? 'TWD'
      const rates = state.exchangeRateSnapshot?.rates ?? {}
      const accountById = new Map(state.accounts.map((item) => [item.id, item]))
      return state.balances.reduce((total, item) => {
        const account = accountById.get(item.id) || item
        if (!isIncludedInAssets(account)) return total
        return total + convertBalanceToTargetCurrency(
          item.balance_minor,
          account,
          targetCurrencyCode,
          rates,
        )
      }, 0)
    },

    regularAccounts(state) {
      return state.accounts.filter((item) => !isSavingsJarAccount(item))
    },

    savingsJarAccounts(state) {
      return state.accounts.filter((item) => isSavingsJarAccount(item))
    },

    groupedAccounts(state) {
      // 轉帳不混入信用卡（還款走信用卡模組）
      return buildGroupedAccounts(state.groups, state.accounts, { includeCredit: false })
    },

    groupedRegularAccounts(state) {
      // 收支記帳可選信用卡；獨立「信用卡」區，不掛現金母分類
      return buildGroupedAccounts(state.groups, state.accounts, { includeSavings: false, includeCredit: true })
    },
  },

  actions: {
    async load(options = {}) {
      const ledgerStore = useLedgerStore()
      const ledgerId = ledgerStore.activeLedgerId
      const requestSeq = this.loadRequestSeq + 1
      this.loadRequestSeq = requestSeq

      this.loading = true
      try {
        if (!ledgerId) {
          if (this.loadRequestSeq === requestSeq) {
            this.groups = []
            this.accounts = []
            this.balances = []
            this.exchangeRateSnapshot = null
          }
          return
        }
        const includeArchived = Boolean(options.includeArchived)
        const [groups, accounts, balances, exchangeRateSnapshot] = await Promise.all([
          listAccountGroups(ledgerId),
          listAccounts(ledgerId, { includeArchived }),
          getAccountBalances(ledgerId, { includeArchived }),
          getExchangeRateSnapshot(ledgerId).catch(() => null),
        ])

        if (this.loadRequestSeq !== requestSeq || useLedgerStore().activeLedgerId !== ledgerId) {
          return
        }
        this.groups = groups
        this.accounts = accounts
        this.balances = balances
        this.exchangeRateSnapshot = exchangeRateSnapshot
      } finally {
        if (this.loadRequestSeq === requestSeq) {
          this.ready = true
          this.loading = false
        }
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
