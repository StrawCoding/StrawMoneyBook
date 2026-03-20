import {
  MEMBERSHIP_SYNC_STATUS_ERROR,
  MONTHLY_MEMBERSHIP_EXPIRY_UNKNOWN_GRACE_MS,
  MONTHLY_MEMBERSHIP_SYNC_FAILURE_GRACE_MS,
  normalizeGooglePlayPlan,
  normalizeSyncStatus,
  toEpochMs,
} from './membership-state.js'

export const MEMBERSHIP_BACKEND_LIFETIME_EXPIRES_AT = '2099-12-31T23:59:59.999Z'

export function resolveSharedLedgerMembershipSyncExpiry(snapshot) {
  const plan = normalizeGooglePlayPlan(snapshot?.plan)
  if (!plan) return ''

  if (plan === 'lifetime') {
    return MEMBERSHIP_BACKEND_LIFETIME_EXPIRES_AT
  }

  const cacheExpiresAtMs = toEpochMs(snapshot?.membershipCacheExpiresAt)
  if (Number.isFinite(cacheExpiresAtMs)) {
    const effectiveMs = snapshot?.lastSyncStatus === MEMBERSHIP_SYNC_STATUS_ERROR
      ? cacheExpiresAtMs + MONTHLY_MEMBERSHIP_SYNC_FAILURE_GRACE_MS
      : cacheExpiresAtMs
    if (effectiveMs > Date.now()) {
      return new Date(effectiveMs).toISOString()
    }
  }

  const verifiedAtMs = toEpochMs(snapshot?.monthlyLastVerifiedAt)
  if (Number.isFinite(verifiedAtMs)) {
    return new Date(verifiedAtMs + MONTHLY_MEMBERSHIP_EXPIRY_UNKNOWN_GRACE_MS).toISOString()
  }

  return ''
}

export function buildMembershipBackendSyncFingerprint(snapshot, sessionUser = null) {
  const userId = String(sessionUser?.id ?? '').trim()
  if (!userId) return ''

  return JSON.stringify({
    userId,
    plan: normalizeGooglePlayPlan(snapshot?.plan),
    lastKnownPlan: normalizeGooglePlayPlan(snapshot?.lastKnownPlan),
    lastSyncStatus: normalizeSyncStatus(snapshot?.lastSyncStatus),
    active: Boolean(snapshot?.active),
    expiresAt: resolveSharedLedgerMembershipSyncExpiry(snapshot),
  })
}

export function shouldSkipInactiveMembershipBackendSync(snapshot) {
  return (
    !normalizeGooglePlayPlan(snapshot?.plan)
    && normalizeSyncStatus(snapshot?.lastSyncStatus) !== 'ok'
  )
}
