export function getBrowserStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage ?? null
  } catch (_error) {
    return null
  }
}

export function toDateKey(dateLike = new Date()) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function readEntitlementState(storage, {
  storageKey,
  createDefaultEntitlementState,
  normalizeEntitlementState,
} = {}) {
  if (!storage) return createDefaultEntitlementState()

  try {
    const raw = storage.getItem(storageKey)
    if (!raw) return createDefaultEntitlementState()
    return normalizeEntitlementState(JSON.parse(raw))
  } catch (_error) {
    return createDefaultEntitlementState()
  }
}

export function writeEntitlementState(storage, state, {
  storageKey,
  normalizeEntitlementState,
} = {}) {
  if (!storage) return
  try {
    storage.setItem(storageKey, JSON.stringify(normalizeEntitlementState(state)))
  } catch (_error) {
    // Ignore write failures.
  }
}

export function migrateLegacyMembershipState(storage, {
  entitlementStorageKey,
  legacyActiveStorageKey,
  legacyPlanStorageKey,
  createDefaultEntitlementState,
  normalizeGooglePlayPlan,
  readEntitlementState,
  writeEntitlementState,
  membershipCacheForever,
  membershipMember,
  membershipSyncStatusError,
  membershipSyncStatusOk,
  nowMs = Date.now(),
} = {}) {
  if (!storage) return createDefaultEntitlementState()

  const existingRaw = storage.getItem(entitlementStorageKey)
  if (existingRaw) {
    const existingState = readEntitlementState(storage)
    writeEntitlementState(storage, existingState)
    return existingState
  }

  const legacyActiveText = String(storage.getItem(legacyActiveStorageKey) ?? '').trim().toLowerCase()
  const legacyPlanText = String(storage.getItem(legacyPlanStorageKey) ?? '').trim().toLowerCase()
  const hadLegacyData = legacyActiveText !== '' || legacyPlanText !== ''

  const state = createDefaultEntitlementState()
  const legacyPlan = normalizeGooglePlayPlan(legacyPlanText)
  const legacyActive = legacyActiveText === '1' || legacyActiveText === 'true' || legacyActiveText === membershipMember

  if (legacyActive) {
    const nowIso = new Date(nowMs).toISOString()
    state.lastSyncAt = nowIso
    if (legacyPlan === 'lifetime') {
      state.lifetimeOwned = true
      state.lastKnownPlan = 'lifetime'
      state.membershipCacheExpiresAt = membershipCacheForever
      state.lastSyncStatus = membershipSyncStatusOk
    } else {
      state.monthlyLastVerifiedAt = nowIso
      state.lastKnownPlan = 'monthly'
      state.membershipCacheExpiresAt = ''
      state.lastSyncStatus = membershipSyncStatusError
    }
  }

  if (hadLegacyData) {
    writeEntitlementState(storage, state)
    try {
      storage.removeItem(legacyActiveStorageKey)
      storage.removeItem(legacyPlanStorageKey)
    } catch (_error) {
      // Ignore remove failures.
    }
  }

  return state
}
