import { defineStore } from 'pinia'
import { translateRuntimeText } from '@/ui/services/i18n.service'

export const useUiStore = defineStore('ui', {
  state: () => ({
    toasts: [],
  }),

  actions: {
    pushToast(message, type = 'info') {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      this.toasts.push({ id, message: translateRuntimeText(message), type })

      setTimeout(() => {
        this.removeToast(id)
      }, 2800)
    },

    removeToast(id) {
      this.toasts = this.toasts.filter((item) => item.id !== id)
    },
  },
})
