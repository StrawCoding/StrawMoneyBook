import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMembershipBenefitsRoute,
  MEMBERSHIP_BENEFITS_ROUTE_PATH,
} from '../src/ui/services/membership-navigation.helpers.js'

test('membership navigation helper builds benefits route with normalized reason', () => {
  assert.equal(MEMBERSHIP_BENEFITS_ROUTE_PATH, '/settings/membership-benefits')
  assert.deepEqual(
    buildMembershipBenefitsRoute('loan_limit'),
    {
      path: '/settings/membership-benefits',
      query: { from: 'loan_limit' },
    },
  )
  assert.deepEqual(
    buildMembershipBenefitsRoute(),
    {
      path: '/settings/membership-benefits',
      query: { from: 'limit_reached' },
    },
  )
})
