import { defineStore } from 'pinia'
import { translateRuntimeText } from '@/ui/services/i18n.service'
import { logToastError } from '@/ui/services/error-log.service'
import router from '@/ui/router'

const MEMBERSHIP_BENEFITS_ROUTE_PATH = '/settings/membership-benefits'

function shouldRedirectToMembershipBenefits(message, type) {
  if (String(type ?? '').trim().toLowerCase() !== 'error') return false
  const text = String(message ?? '').trim()
  if (!text) return false
  return text.startsWith('免費版') || text.includes('MEMBERSHIP_LIMIT_')
}

function redirectToMembershipBenefitsFromToast() {
  const currentPath = String(router.currentRoute?.value?.path ?? '')
  if (currentPath === MEMBERSHIP_BENEFITS_ROUTE_PATH) return
  void router.push({
    path: MEMBERSHIP_BENEFITS_ROUTE_PATH,
    query: {
      from: 'limit_toast',
    },
  }).catch(() => {
    // Ignore navigation failures to avoid blocking toast rendering.
  })
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    toasts: [],
  }),

  actions: {
    pushToast(message, type = 'info') {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const translatedMessage = translateRuntimeText(message)
      this.toasts.push({ id, message: translatedMessage, type })

      if (shouldRedirectToMembershipBenefits(translatedMessage, type)) {
        redirectToMembershipBenefitsFromToast()
      }

      if (String(type ?? '').trim().toLowerCase() === 'error') {
        const routePath = String(router.currentRoute?.value?.fullPath || router.currentRoute?.value?.path || '')
        logToastError(translatedMessage, routePath)
      }

      setTimeout(() => {
        this.removeToast(id)
      }, 2800)
    },

    removeToast(id) {
      this.toasts = this.toasts.filter((item) => item.id !== id)
    },
  },
})
