const MEMBERSHIP_FREE = 'free'
const MEMBERSHIP_MEMBER = 'member'
const MEMBERSHIP_CACHE_FOREVER = 'forever'
const MEMBERSHIP_SYNC_STATUS_OK = 'ok'
const MEMBERSHIP_SYNC_STATUS_ERROR = 'error'
const MONTHLY_MEMBERSHIP_EXPIRY_UNKNOWN_GRACE_MS = 12 * 60 * 60 * 1000
const MONTHLY_MEMBERSHIP_SYNC_FAILURE_GRACE_MS = 3 * 24 * 60 * 60 * 1000

export {
  MEMBERSHIP_CACHE_FOREVER,
  MEMBERSHIP_FREE,
  MEMBERSHIP_MEMBER,
  MEMBERSHIP_SYNC_STATUS_ERROR,
  MEMBERSHIP_SYNC_STATUS_OK,
  MONTHLY_MEMBERSHIP_EXPIRY_UNKNOWN_GRACE_MS,
  MONTHLY_MEMBERSHIP_SYNC_FAILURE_GRACE_MS,
}

export function toEpochMs(value) {
  if (value === null || value === undefined || value === '') return Number.NaN

  if (value instanceof Date) {
    const dateMs = value.getTime()
    return Number.isFinite(dateMs) ? dateMs : Number.NaN
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return Number.NaN
    const absValue = Math.abs(value)
    if (absValue < 1e11) {
      return Math.round(value * 1000)
    }
    return Math.round(value)
  }

  const text = String(value).trim()
  if (!text) return Number.NaN

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return toEpochMs(Number(text))
  }

  const parsedMs = Date.parse(text)
  return Number.isFinite(parsedMs) ? parsedMs : Number.NaN
}

export function normalizeGooglePlayPlan(plan) {
  if (plan === 'monthly') return 'monthly'
  if (plan === 'lifetime') return 'lifetime'
  return ''
}

export function normalizeSyncStatus(status) {
  return status === MEMBERSHIP_SYNC_STATUS_OK ? MEMBERSHIP_SYNC_STATUS_OK : MEMBERSHIP_SYNC_STATUS_ERROR
}

export function createDefaultEntitlementState() {
  return {
    lifetimeOwned: false,
    monthlyLastVerifiedAt: '',
    membershipCacheExpiresAt: '',
    lastSyncAt: '',
    lastSyncStatus: MEMBERSHIP_SYNC_STATUS_ERROR,
    lastKnownPlan: '',
  }
}

export function normalizeCacheExpiry(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (text === MEMBERSHIP_CACHE_FOREVER) return MEMBERSHIP_CACHE_FOREVER
  const ms = Date.parse(text)
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toISOString()
}

export function toExpiryIso(value) {
  const ms = toEpochMs(value)
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toISOString()
}

export function isMembershipCacheValid(state, nowMs = Date.now()) {
  const cacheExpiresAt = String(state?.membershipCacheExpiresAt ?? '').trim()
  if (!cacheExpiresAt) return false
  if (cacheExpiresAt === MEMBERSHIP_CACHE_FOREVER) return true
  const expiresMs = Date.parse(cacheExpiresAt)
  if (!Number.isFinite(expiresMs)) return false
  return expiresMs > nowMs
}

export function isMonthlySyncFailureGraceActive(state, nowMs = Date.now()) {
  if (normalizeGooglePlayPlan(state?.lastKnownPlan) !== 'monthly') return false
  if (normalizeSyncStatus(state?.lastSyncStatus) !== MEMBERSHIP_SYNC_STATUS_ERROR) return false

  const cacheExpiresAt = String(state?.membershipCacheExpiresAt ?? '').trim()
  if (!cacheExpiresAt || cacheExpiresAt === MEMBERSHIP_CACHE_FOREVER) return false

  const expiresMs = Date.parse(cacheExpiresAt)
  if (!Number.isFinite(expiresMs)) return false

  return nowMs <= (expiresMs + MONTHLY_MEMBERSHIP_SYNC_FAILURE_GRACE_MS)
}

export function normalizeEntitlementState(source) {
  const defaults = createDefaultEntitlementState()
  if (!source || typeof source !== 'object') return defaults

  const normalized = {
    lifetimeOwned: Boolean(source.lifetimeOwned),
    monthlyLastVerifiedAt: String(source.monthlyLastVerifiedAt ?? '').trim(),
    membershipCacheExpiresAt: normalizeCacheExpiry(source.membershipCacheExpiresAt),
    lastSyncAt: String(source.lastSyncAt ?? '').trim(),
    lastSyncStatus: normalizeSyncStatus(source.lastSyncStatus),
    lastKnownPlan: normalizeGooglePlayPlan(String(source.lastKnownPlan ?? '').trim().toLowerCase()),
  }

  if (normalized.lifetimeOwned && normalized.lastKnownPlan !== 'lifetime') {
    normalized.lastKnownPlan = 'lifetime'
  }
  if (normalized.lifetimeOwned) {
    normalized.membershipCacheExpiresAt = MEMBERSHIP_CACHE_FOREVER
  }
  return normalized
}

export function getTierAndPlanFromState(state, { debugEnabled = false, nowMs = Date.now() } = {}) {
  if (debugEnabled) {
    return {
      tier: MEMBERSHIP_MEMBER,
      plan: state.lifetimeOwned ? 'lifetime' : normalizeGooglePlayPlan(state.lastKnownPlan || 'monthly'),
      source: 'debug_override',
    }
  }

  if (state.lifetimeOwned) {
    return {
      tier: MEMBERSHIP_MEMBER,
      plan: 'lifetime',
      source: 'lifetime_cache',
    }
  }

  const knownPlan = normalizeGooglePlayPlan(state.lastKnownPlan)

  if (knownPlan && isMembershipCacheValid(state, nowMs)) {
    const source = state.lastSyncStatus === MEMBERSHIP_SYNC_STATUS_OK
      ? 'play_sync'
      : `${knownPlan}_cache`
    return {
      tier: MEMBERSHIP_MEMBER,
      plan: knownPlan,
      source,
    }
  }

  if (isMonthlySyncFailureGraceActive(state, nowMs)) {
    return {
      tier: MEMBERSHIP_MEMBER,
      plan: 'monthly',
      source: 'monthly_sync_error_grace',
    }
  }

  return {
    tier: MEMBERSHIP_FREE,
    plan: '',
    source: 'free',
  }
}

export function resolveMonthlyCacheExpiry(ownedMonthly, previousState, nowMs = Date.now()) {
  const ownedExpiryIso = toExpiryIso(ownedMonthly?.expiresAt ?? ownedMonthly?.expirationDate)
  const ownedExpiryMs = toEpochMs(ownedExpiryIso)
  if (Number.isFinite(ownedExpiryMs) && ownedExpiryMs > nowMs) {
    return new Date(ownedExpiryMs).toISOString()
  }

  const previousPlan = normalizeGooglePlayPlan(previousState?.lastKnownPlan)
  const previousExpiryMs = toEpochMs(previousState?.membershipCacheExpiresAt)
  if (previousPlan === 'monthly' && Number.isFinite(previousExpiryMs) && previousExpiryMs > nowMs) {
    return new Date(previousExpiryMs).toISOString()
  }

  if (ownedMonthly) {
    return new Date(nowMs + MONTHLY_MEMBERSHIP_EXPIRY_UNKNOWN_GRACE_MS).toISOString()
  }

  return ''
}

export function resolveMonthlyCacheExpiryFromPurchaseResult(purchaseResult, previousState, nowMs = Date.now()) {
  const directExpiryIso = toExpiryIso(
    purchaseResult?.expiresAt
      ?? purchaseResult?.expirationDate
      ?? purchaseResult?.expiryDate
      ?? purchaseResult?.expiresDate
      ?? purchaseResult?.expirationTime
      ?? purchaseResult?.expiryTime
      ?? purchaseResult?.expirationTimeMillis
      ?? purchaseResult?.expiryTimeMillis,
  )

  if (directExpiryIso) {
    const directExpiryMs = toEpochMs(directExpiryIso)
    if (Number.isFinite(directExpiryMs) && directExpiryMs > nowMs) {
      return new Date(directExpiryMs).toISOString()
    }
  }

  if (Array.isArray(purchaseResult?.transactions)) {
    for (const transaction of purchaseResult.transactions) {
      const txExpiryIso = toExpiryIso(
        transaction?.expiresAt
          ?? transaction?.expirationDate
          ?? transaction?.expiryDate
          ?? transaction?.expiresDate
          ?? transaction?.expirationTime
          ?? transaction?.expiryTime
          ?? transaction?.expirationTimeMillis
          ?? transaction?.expiryTimeMillis,
      )
      if (!txExpiryIso) continue
      const txExpiryMs = toEpochMs(txExpiryIso)
      if (Number.isFinite(txExpiryMs) && txExpiryMs > nowMs) {
        return new Date(txExpiryMs).toISOString()
      }
    }
  }

  return resolveMonthlyCacheExpiry(null, previousState, nowMs)
}
