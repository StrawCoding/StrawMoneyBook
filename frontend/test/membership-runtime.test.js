import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMembershipBackendSyncFingerprint,
  resolveSharedLedgerMembershipSyncExpiry,
  shouldSkipInactiveMembershipBackendSync,
} from '../src/core/services/membership-backend-sync.js'
import {
  hasFreshGooglePlaySupportCache,
  isDebugMembershipOverrideEnabledFromEnv,
  shouldSkipMembershipBackendSyncTask,
} from '../src/core/services/membership-runtime.js'
import {
  MEMBERSHIP_CACHE_FOREVER,
  createDefaultEntitlementState,
  getTierAndPlanFromState,
  normalizeEntitlementState,
  resolveMonthlyCacheExpiryFromPurchaseResult,
} from '../src/core/services/membership-state.js'

test('debug membership override honors debug mode and explicit env flags', () => {
  assert.equal(isDebugMembershipOverrideEnabledFromEnv({ MODE: 'debug' }), true)
  assert.equal(isDebugMembershipOverrideEnabledFromEnv({ VITE_FORCE_MEMBER_ON_DEBUG: 'true' }), true)
  assert.equal(isDebugMembershipOverrideEnabledFromEnv({ MODE: 'production' }), false)
})

test('google play support cache uses different ttl windows for ok and fail states', () => {
  assert.equal(
    hasFreshGooglePlaySupportCache(
      { checkedAt: 1_000, supported: true },
      { nowMs: 1_000 + 119_000, okTtlMs: 120_000, failTtlMs: 10_000 },
    ),
    true,
  )
  assert.equal(
    hasFreshGooglePlaySupportCache(
      { checkedAt: 1_000, supported: false },
      { nowMs: 1_000 + 11_000, okTtlMs: 120_000, failTtlMs: 10_000 },
    ),
    false,
  )
})

test('monthly sync failure grace keeps membership active after cache expiry', () => {
  const state = normalizeEntitlementState({
    lifetimeOwned: false,
    monthlyLastVerifiedAt: '2026-03-19T00:00:00.000Z',
    membershipCacheExpiresAt: '2026-03-20T00:00:00.000Z',
    lastSyncAt: '2026-03-20T00:00:00.000Z',
    lastSyncStatus: 'error',
    lastKnownPlan: 'monthly',
  })

  const tier = getTierAndPlanFromState(state, {
    nowMs: Date.parse('2026-03-21T00:00:00.000Z'),
  })

  assert.equal(tier.tier, 'member')
  assert.equal(tier.plan, 'monthly')
  assert.equal(tier.source, 'monthly_sync_error_grace')
})

test('backend sync cooldown skips repeated syncs for the same fingerprint', () => {
  assert.equal(
    shouldSkipMembershipBackendSyncTask({
      sessionUser: { id: 'user_1' },
      debugEnabled: false,
      fingerprint: 'same',
      lastFingerprint: 'same',
      lastSyncedAt: 1_000,
      nowMs: 20_000,
      cooldownMs: 30_000,
      inactiveSnapshot: false,
    }),
    true,
  )
})

test('shared ledger backend sync expiry uses lifetime and monthly grace rules', () => {
  assert.equal(
    resolveSharedLedgerMembershipSyncExpiry({
      plan: 'lifetime',
      active: true,
    }),
    '2099-12-31T23:59:59.999Z',
  )

  const monthlyExpiry = resolveSharedLedgerMembershipSyncExpiry({
    plan: 'monthly',
    active: true,
    membershipCacheExpiresAt: '2099-01-01T00:00:00.000Z',
    lastSyncStatus: 'error',
    monthlyLastVerifiedAt: '2026-03-19T00:00:00.000Z',
  })
  assert.match(monthlyExpiry, /^2099-01-0/)
})

test('backend sync fingerprint is empty without a session user and stable when active', () => {
  assert.equal(buildMembershipBackendSyncFingerprint({ plan: 'monthly' }, null), '')

  const fingerprint = buildMembershipBackendSyncFingerprint({
    plan: 'monthly',
    lastKnownPlan: 'monthly',
    lastSyncStatus: 'ok',
    active: true,
    membershipCacheExpiresAt: '2099-01-01T00:00:00.000Z',
  }, { id: 'user_1' })

  assert.match(fingerprint, /"userId":"user_1"/)
  assert.match(fingerprint, /"plan":"monthly"/)
})

test('inactive backend sync snapshots are skipped', () => {
  assert.equal(
    shouldSkipInactiveMembershipBackendSync({
      plan: '',
      lastSyncStatus: 'error',
    }),
    true,
  )
  assert.equal(
    shouldSkipInactiveMembershipBackendSync({
      plan: '',
      lastSyncStatus: 'ok',
    }),
    false,
  )
})

test('purchase result expiry falls back to direct expiry fields and keeps forever cache for lifetime', () => {
  const fallbackState = createDefaultEntitlementState()
  const expiry = resolveMonthlyCacheExpiryFromPurchaseResult({
    expirationTimeMillis: Date.parse('2026-04-01T00:00:00.000Z'),
  }, fallbackState, Date.parse('2026-03-20T00:00:00.000Z'))

  assert.equal(expiry, '2026-04-01T00:00:00.000Z')
  assert.equal(
    normalizeEntitlementState({
      lifetimeOwned: true,
      membershipCacheExpiresAt: '2026-03-20T00:00:00.000Z',
      lastKnownPlan: '',
    }).membershipCacheExpiresAt,
    MEMBERSHIP_CACHE_FOREVER,
  )
})
