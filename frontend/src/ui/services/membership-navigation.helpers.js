export const MEMBERSHIP_BENEFITS_ROUTE_PATH = '/settings/membership-benefits'

export function buildMembershipBenefitsRoute(reason = 'limit_reached') {
  return {
    path: MEMBERSHIP_BENEFITS_ROUTE_PATH,
    query: {
      from: String(reason ?? 'limit_reached'),
    },
  }
}
