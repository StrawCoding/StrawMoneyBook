import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('smb294: carrier availability source keeps membership → api → credentials order', () => {
  const availability = read('src/services/einvoice/availability.js')
  assert.match(availability, /id: 'membership'/)
  assert.match(availability, /id: 'api'/)
  assert.match(availability, /id: 'credentials'/)
  assert.match(availability, /carrier_sync_membership_required/)
  assert.match(availability, /recovery: 'membership'/)
  const membershipIdx = availability.indexOf("id: 'membership'")
  const apiIdx = availability.indexOf("id: 'api'")
  const credsIdx = availability.indexOf("id: 'credentials'")
  assert.ok(membershipIdx < apiIdx && apiIdx < credsIdx)
})

test('smb294: playwright carrier script covers error-code branching + seeded review', () => {
  const carrier = read('scripts/playwright-carrier-sync-settings.mjs')
  assert.match(carrier, /__SMB_PLAYWRIGHT_CARRIER_SYNC__|straw\.playwright\.hooks/)
  assert.match(carrier, /carrier_sync_membership_required/)
  assert.match(carrier, /seedMembershipAndPendingReview/)
  assert.match(carrier, /carrier-sync-review/)
  assert.match(carrier, /button:has-text\('Next'\), button:has-text\('下一步'\)/)
})
