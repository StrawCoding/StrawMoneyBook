import { defineStore } from 'pinia'
import { useLedgerStore } from '@/ui/stores/ledger.store'
import { getDefaultAddonTemplates, loadAddonTemplates, saveAddonTemplates } from '@/ui/services/addon-template.service'

export const useAddonTemplateStore = defineStore('addonTemplate', {
  state: () => ({
    templates: getDefaultAddonTemplates(),
    loading: false,
  }),

  getters: {
    options(state) {
      return state.templates.map((item) => ({
        value: item.id,
        label: item.label,
      }))
    },
  },

  actions: {
    async load() {
      const ledgerStore = useLedgerStore()
      if (!ledgerStore.activeLedgerId) {
        this.templates = getDefaultAddonTemplates()
        return
      }

      this.loading = true
      try {
        this.templates = await loadAddonTemplates(ledgerStore.activeLedgerId)
      } finally {
        this.loading = false
      }
    },

    async save(templates) {
      const ledgerStore = useLedgerStore()
      this.templates = await saveAddonTemplates(ledgerStore.activeLedgerId, templates)
    },

    resetDefaults() {
      this.templates = getDefaultAddonTemplates()
    },
  },
})
