import router from '@/ui/router'
import { setMembershipLimitNavigationHandler } from '@/core/services/membership.service'
import { buildMembershipBenefitsRoute, MEMBERSHIP_BENEFITS_ROUTE_PATH } from './membership-navigation.helpers'

let installed = false
let navigationInFlight = null

export function createMembershipBenefitsNavigator(routerInstance = router) {
  return async function navigateToMembershipBenefits(reason = 'limit_reached') {
    if (!routerInstance || navigationInFlight) return

    navigationInFlight = Promise.resolve()
      .then(async () => {
        const currentPath = String(routerInstance.currentRoute?.value?.path ?? '')
        if (currentPath === MEMBERSHIP_BENEFITS_ROUTE_PATH) return
        await routerInstance.push(buildMembershipBenefitsRoute(reason))
      })
      .catch(() => {
        // Ignore navigation failures to avoid blocking business flow.
      })
      .finally(() => {
        navigationInFlight = null
      })

    await navigationInFlight
  }
}

export function installMembershipNavigation() {
  if (installed) return

  const navigate = createMembershipBenefitsNavigator()
  setMembershipLimitNavigationHandler(({ reason }) => {
    void navigate(reason)
  })
  installed = true
}
