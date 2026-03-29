import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createGooglePlayTraceStore,
} from '../src/core/services/membership-google-play-trace.js'
import {
  createMembershipProductDisplayStore,
} from '../src/core/services/membership-product-display.js'
import {
  createDefaultEntitlementState,
  normalizeEntitlementState,
} from '../src/core/services/membership-state.js'
import {
  migrateLegacyMembershipState,
  readEntitlementState,
  toDateKey,
  writeEntitlementState,
} from '../src/core/services/membership-storage.js'
import {
  getDailyUsage,
  recordDailyUsage,
} from '../src/core/services/membership-usage.js'

function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null
    },
    setItem(key, value) {
      data.set(key, String(value))
    },
    removeItem(key) {
      data.delete(key)
    },
  }
}

test('legacy membership state migrates into the v2 entitlement key and clears legacy keys', () => {
  const storage = createMemoryStorage({
    'straw.membership.google_play.active': 'true',
    'straw.membership.google_play.plan': 'lifetime',
  })

  const state = migrateLegacyMembershipState(storage, {
    entitlementStorageKey: 'straw.membership.entitlement.v2',
    legacyActiveStorageKey: 'straw.membership.google_play.active',
    legacyPlanStorageKey: 'straw.membership.google_play.plan',
    createDefaultEntitlementState,
    normalizeGooglePlayPlan: (plan) => (plan === 'lifetime' ? 'lifetime' : ''),
    readEntitlementState: (nextStorage) => readEntitlementState(nextStorage, {
      storageKey: 'straw.membership.entitlement.v2',
      createDefaultEntitlementState,
      normalizeEntitlementState,
    }),
    writeEntitlementState: (nextStorage, nextState) => writeEntitlementState(nextStorage, nextState, {
      storageKey: 'straw.membership.entitlement.v2',
      normalizeEntitlementState,
    }),
    membershipCacheForever: 'forever',
    membershipMember: 'member',
    membershipSyncStatusError: 'error',
    membershipSyncStatusOk: 'ok',
    nowMs: Date.parse('2026-03-20T00:00:00.000Z'),
  })

  assert.equal(state.lifetimeOwned, true)
  assert.equal(state.membershipCacheExpiresAt, 'forever')
  assert.equal(storage.getItem('straw.membership.google_play.active'), null)
  assert.equal(storage.getItem('straw.membership.google_play.plan'), null)
  assert.ok(storage.getItem('straw.membership.entitlement.v2'))
})

test('membership product display store serves cached values after a fetch failure', async () => {
  const store = createMembershipProductDisplayStore({ cacheTtlMs: 60_000 })

  const first = await store.fetchDisplay({
    ensureSupported: async () => true,
    loadDisplay: async () => ({
      monthly: '$70',
      lifetime: '$390',
    }),
  })
  assert.equal(first.monthly, '$70')

  const second = await store.fetchDisplay({
    force: true,
    ensureSupported: async () => true,
    loadDisplay: async () => {
      throw new Error('billing disconnected')
    },
  })

  assert.equal(second.monthly, '$70')
  assert.equal(store.getSnapshot().lifetime, '$390')
})

test('AI bookkeeping daily usage increments and respects the daily bucket key', () => {
  const storage = createMemoryStorage()

  const before = getDailyUsage({
    now: new Date('2026-03-20T10:00:00.000Z'),
    storage,
    storageKey: 'straw.membership.ai_bookkeeping_daily_usage.v1',
    toDateKey,
    limit: 5,
  })
  assert.equal(before.used, 0)
  assert.equal(before.remaining, 5)

  const after = recordDailyUsage({
    now: new Date('2026-03-20T10:00:00.000Z'),
    storage,
    storageKey: 'straw.membership.ai_bookkeeping_daily_usage.v1',
    toDateKey,
    limit: 5,
  })

  assert.equal(after.dateKey, '2026-03-20')
  assert.equal(after.used, 1)
  assert.equal(after.remaining, 4)
})

test('google play trace store records error status and operation ordering', async () => {
  const store = createGooglePlayTraceStore({ maxEntries: 5 })

  await assert.rejects(
    store.trace('load_products', async () => {
      throw Object.assign(new Error('network down'), { code: 'network_down' })
    }),
  )
  await store.trace('query_owned', async () => ({ ok: true }))

  const snapshot = store.getSnapshot()
  assert.equal(snapshot[0]?.operation, 'query_owned')
  assert.equal(snapshot[0]?.status, 'ok')
  assert.equal(snapshot[1]?.operation, 'load_products')
  assert.equal(snapshot[1]?.status, 'error')
  assert.equal(snapshot[1]?.errorCode, 'NETWORK_DOWN')
})
