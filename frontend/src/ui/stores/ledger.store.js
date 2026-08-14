import { defineStore, getActivePinia } from 'pinia'
import { Capacitor, registerPlugin } from '@capacitor/core'
import {
  createLedger,
  deleteLedger,
  listLedgers,
  renameLedger,
  updateLedgerSortOrders,
} from '@/core/repositories/ledger.repo'
import { applyLedgerBudgetPeriodSettings } from '@/core/services/budget.service'
import { ensureLedgerDefaults } from '@/core/services/seed.service'
import { MembershipGate } from '@/core/domain/membership-gate.js'
import { getCurrentLocale } from '@/ui/services/i18n.service'
import {
  loadLedgerScopedStores,
  resetLedgerScopedStores,
  resolveInitialActiveLedgerId,
} from '@/ui/services/ledger-runtime.service'

const ACTIVE_LEDGER_KEY = 'straw.active_ledger_id'
const WearCompanion = registerPlugin('WearCompanion')

function persistWearActiveLedger(ledgerId) {
  if (!(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')) return
  void WearCompanion.setActiveLedger({ ledgerId: String(ledgerId ?? '') }).catch(() => {})
}

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

    async init(options = {}) {
      const storage = options?.storage ?? globalThis.localStorage
      this.loading = true
      try {
        await this.refresh()
        this.activeLedgerId = resolveInitialActiveLedgerId(this.ledgers, {
          cachedLedgerId: storage?.getItem?.(ACTIVE_LEDGER_KEY),
          membershipTier: MembershipGate.getSnapshot(),
        })
        this.persistActive(storage)
      } catch (error) {
        this.ledgers = []
        this.activeLedgerId = ''
        this.persistActive(storage)
        resetLedgerScopedStores(getActivePinia())
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

    persistActive(storage = globalThis.localStorage) {
      if (!storage?.setItem || !storage?.removeItem) {
        persistWearActiveLedger(this.activeLedgerId)
        return
      }
      if (this.activeLedgerId) {
        storage.setItem(ACTIVE_LEDGER_KEY, this.activeLedgerId)
      } else {
        storage.removeItem(ACTIVE_LEDGER_KEY)
      }
      persistWearActiveLedger(this.activeLedgerId)
    },

    async switchLedger(nextLedgerId, options = {}) {
      const pinia = getActivePinia()
      const force = Boolean(options?.force)
      if (!nextLedgerId) {
        this.activeLedgerId = ''
        this.persistActive()
        resetLedgerScopedStores(pinia)
        return
      }
      if (MembershipGate.isFreeTier() && this.ledgers.length > 0 && nextLedgerId !== this.ledgers[0].id) {
        throw new Error('免費版僅可使用 1 個帳本')
      }
      if (!force && nextLedgerId === this.activeLedgerId) return
      this.activeLedgerId = nextLedgerId
      this.persistActive()
      await loadLedgerScopedStores(this.activeLedgerId, pinia)
    },

    async addLedger(input) {
      const pinia = getActivePinia()
      MembershipGate.assertCanCreateLedger(this.ledgers.length)
      const ledger = await createLedger(input)

      this.applyLedgerList([...this.ledgers, ledger])
      this.activeLedgerId = ledger.id
      this.persistActive()

      await ensureLedgerDefaults(ledger.id, {
        locale: getCurrentLocale(),
        assumeEmpty: true,
      })

      await loadLedgerScopedStores(this.activeLedgerId, pinia)
    },

    async reloadActiveLedger() {
      const pinia = getActivePinia()
      await this.refresh()
      if (!this.activeLedgerId) {
        resetLedgerScopedStores(pinia)
        return
      }
      await loadLedgerScopedStores(this.activeLedgerId, pinia)
    },

    async renameLedger(ledgerId, name) {
      await renameLedger(ledgerId, name)
      await this.refresh()
    },

    async updateBudgetPeriodSettings(ledgerId, payload, options = {}) {
      await applyLedgerBudgetPeriodSettings(ledgerId, payload, options)
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
