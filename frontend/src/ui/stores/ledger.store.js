import { defineStore } from 'pinia'
import { createLedger, deleteLedger, listLedgers, renameLedger, updateLedgerSortOrders } from '@/core/repositories/ledger.repo'
import { ensureLedgerDefaults } from '@/core/services/seed.service'
import { assertCanCreateLedger, getMembershipTierSnapshot, isFreeTier } from '@/core/services/membership.service'
import { useAccountStore } from '@/ui/stores/account.store'
import { useCategoryStore } from '@/ui/stores/category.store'
import { useTransactionStore } from '@/ui/stores/transaction.store'
import { useBudgetStore } from '@/ui/stores/budget.store'
import { useLoanStore } from '@/ui/stores/loan.store'
import { useReimbursementStore } from '@/ui/stores/reimbursement.store'
import { useAddonTemplateStore } from '@/ui/stores/addon-template.store'
import { getCurrentLocale } from '@/ui/services/i18n.service'

const ACTIVE_LEDGER_KEY = 'straw.active_ledger_id'

export const useLedgerStore = defineStore('ledger', {
  state: () => ({
    ledgers: [],
    activeLedgerId: '',
    loading: false,
    ready: false,
  }),

  getters: {
    activeLedger(state) {
      return state.ledgers.find((ledger) => ledger.id === state.activeLedgerId) ?? null
    },
  },

  actions: {
    applyLedgerList(nextLedgers = []) {
      this.ledgers = [...nextLedgers].sort((a, b) => {
        const aOrder = Number(a?.sort_order ?? 0)
        const bOrder = Number(b?.sort_order ?? 0)
        if (aOrder !== bOrder) return aOrder - bOrder
        const aCreated = Date.parse(String(a?.created_at ?? ''))
        const bCreated = Date.parse(String(b?.created_at ?? ''))
        const aMs = Number.isFinite(aCreated) ? aCreated : 0
        const bMs = Number.isFinite(bCreated) ? bCreated : 0
        return aMs - bMs
      })
    },

    resetLedgerScopedStores() {
      const accountStore = useAccountStore()
      const categoryStore = useCategoryStore()
      const transactionStore = useTransactionStore()
      const budgetStore = useBudgetStore()
      const loanStore = useLoanStore()
      const reimbursementStore = useReimbursementStore()
      const addonTemplateStore = useAddonTemplateStore()

      accountStore.$reset()
      categoryStore.$reset()
      transactionStore.$reset()
      budgetStore.$reset()
      loanStore.$reset()
      reimbursementStore.$reset()
      addonTemplateStore.$reset()
    },

    async init() {
      this.loading = true
      try {
        await this.refresh()

        const cachedLedgerId = localStorage.getItem(ACTIVE_LEDGER_KEY)
        if (cachedLedgerId && this.ledgers.some((item) => item.id === cachedLedgerId)) {
          this.activeLedgerId = cachedLedgerId
        } else {
          this.activeLedgerId = this.ledgers[0]?.id ?? ''
        }

        if (getMembershipTierSnapshot() === 'free' && this.ledgers.length > 0) {
          this.activeLedgerId = this.ledgers[0].id
        }

        this.persistActive()
        if (!this.activeLedgerId) {
          this.resetLedgerScopedStores()
        }
      } catch (error) {
        this.ledgers = []
        this.activeLedgerId = ''
        this.persistActive()
        this.resetLedgerScopedStores()
        throw error
      } finally {
        // Never keep the app in infinite booting state.
        this.ready = true
        this.loading = false
      }
    },

    async refresh() {
      this.applyLedgerList(await listLedgers())
    },

    persistActive() {
      if (this.activeLedgerId) {
        localStorage.setItem(ACTIVE_LEDGER_KEY, this.activeLedgerId)
        return
      }
      localStorage.removeItem(ACTIVE_LEDGER_KEY)
    },

    async switchLedger(nextLedgerId) {
      if (!nextLedgerId) {
        this.activeLedgerId = ''
        this.persistActive()
        this.resetLedgerScopedStores()
        return
      }
      if (isFreeTier() && this.ledgers.length > 0 && nextLedgerId !== this.ledgers[0].id) {
        throw new Error('免費版僅可使用 1 個帳本')
      }
      if (nextLedgerId === this.activeLedgerId) return
      this.activeLedgerId = nextLedgerId
      this.persistActive()

      const accountStore = useAccountStore()
      const categoryStore = useCategoryStore()
      const transactionStore = useTransactionStore()
      const budgetStore = useBudgetStore()
      const loanStore = useLoanStore()
      const reimbursementStore = useReimbursementStore()
      const addonTemplateStore = useAddonTemplateStore()

      await Promise.all([
        accountStore.load(),
        categoryStore.load(),
        transactionStore.loadRecent(),
        budgetStore.loadCurrentMonth(),
        loanStore.load(),
        reimbursementStore.load(),
        addonTemplateStore.load(),
      ])
    },

    async addLedger(input) {
      assertCanCreateLedger(this.ledgers.length)
      const ledger = await createLedger(input)

      this.applyLedgerList([...this.ledgers, ledger])
      this.activeLedgerId = ledger.id
      this.persistActive()

      const accountStore = useAccountStore()
      const categoryStore = useCategoryStore()
      const transactionStore = useTransactionStore()
      const budgetStore = useBudgetStore()
      const loanStore = useLoanStore()
      const reimbursementStore = useReimbursementStore()
      const addonTemplateStore = useAddonTemplateStore()

      await ensureLedgerDefaults(ledger.id, {
        locale: getCurrentLocale(),
        assumeEmpty: true,
      })

      await Promise.all([
        categoryStore.load(),
        accountStore.load(),
        transactionStore.loadRecent(),
        budgetStore.loadCurrentMonth(),
        loanStore.load(),
        reimbursementStore.load(),
        addonTemplateStore.load(),
      ])
    },

    async renameLedger(ledgerId, name) {
      await renameLedger(ledgerId, name)
      await this.refresh()
    },

    async removeLedger(ledgerId) {
      await deleteLedger(ledgerId)
      await this.refresh()

      if (this.activeLedgerId === ledgerId) {
        await this.switchLedger(this.ledgers[0]?.id ?? '')
        return
      }

      this.persistActive()
    },

    async reorderLedgers(ledgerIds) {
      await updateLedgerSortOrders(ledgerIds)
      await this.refresh()
    },
  },
})
