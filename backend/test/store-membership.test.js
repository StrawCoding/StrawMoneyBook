import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyMembershipGrant,
  getMembershipGrantSummary,
  syncMembershipGrantBySource,
} from '../src/collab/store-membership.js'

function createUser() {
  return {
    id: 'user_1',
    membership_grants: [],
    updated_at: '',
  }
}

test('applyMembershipGrant appends a future-dated grant and marks the user updated', () => {
  const user = createUser()
  const grant = applyMembershipGrant(user, 3, 'manual', { source: 'test' }, {
    createId: (prefix) => `${prefix}_1`,
    nowIso: () => '2026-03-20T00:00:00.000Z',
    nowMs: Date.parse('2026-03-20T00:00:00.000Z'),
  })

  assert.equal(user.membership_grants.length, 1)
  assert.equal(grant.id, 'membership_grant_1')
  assert.equal(grant.end_at, '2026-03-23T00:00:00.000Z')
  assert.equal(user.updated_at, '2026-03-20T00:00:00.000Z')
})

test('getMembershipGrantSummary only reports active grants', () => {
  const summary = getMembershipGrantSummary({
    membership_grants: [{
      source: 'expired',
      end_at: '2026-03-19T00:00:00.000Z',
    }, {
      source: 'active',
      end_at: '2026-03-25T00:00:00.000Z',
    }],
  }, Date.parse('2026-03-20T00:00:00.000Z'))

  assert.equal(summary.active, true)
  assert.equal(summary.source, 'active')
  assert.equal(summary.expiresAt, '2026-03-25T00:00:00.000Z')
})

test('syncMembershipGrantBySource replaces existing grants and removes inactive ones', () => {
  const user = createUser()
  user.membership_grants = [{
    id: 'old',
    source: 'google_play',
    start_at: '2026-03-01T00:00:00.000Z',
    end_at: '2026-03-10T00:00:00.000Z',
    created_at: '2026-03-01T00:00:00.000Z',
    meta: {},
  }]

  const grant = syncMembershipGrantBySource(user, 'google_play', {
    active: true,
    endAt: '2026-04-01T00:00:00.000Z',
  }, {
    createId: (prefix) => `${prefix}_next`,
    nowIso: () => '2026-03-20T00:00:00.000Z',
    createStoreError: (message, code, status) => {
      const error = new Error(message)
      error.code = code
      error.status = status
      return error
    },
    nowMs: Date.parse('2026-03-20T00:00:00.000Z'),
  })

  assert.equal(user.membership_grants.length, 1)
  assert.equal(grant.id, 'membership_grant_next')
  assert.equal(user.membership_grants[0].source, 'google_play')

  const removed = syncMembershipGrantBySource(user, 'google_play', {
    active: false,
  }, {
    createId: () => 'unused',
    nowIso: () => '2026-03-21T00:00:00.000Z',
    createStoreError: (message, code, status) => {
      const error = new Error(message)
      error.code = code
      error.status = status
      return error
    },
    nowMs: Date.parse('2026-03-21T00:00:00.000Z'),
  })

  assert.equal(removed, null)
  assert.equal(user.membership_grants.length, 0)
})
