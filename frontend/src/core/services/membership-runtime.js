export function isDebugMembershipOverrideEnabledFromEnv(env = {}) {
  const mode = String(env.MODE ?? '').trim().toLowerCase()
  if (mode === 'debug') return true

  const force = String(env.VITE_FORCE_MEMBER_ON_DEBUG ?? '').trim().toLowerCase()
  return force === '1' || force === 'true' || force === 'yes' || force === 'on'
}

export function hasFreshGooglePlaySupportCache(
  cache,
  {
    nowMs = Date.now(),
    okTtlMs = 2 * 60 * 1000,
    failTtlMs = 10 * 1000,
  } = {},
) {
  if (Number(cache?.checkedAt ?? 0) <= 0) return false
  const ttl = cache?.supported ? okTtlMs : failTtlMs
  return nowMs - Number(cache.checkedAt) <= ttl
}

export function shouldSkipMembershipBackendSyncTask({
  sessionUser = null,
  debugEnabled = false,
  fingerprint = '',
  lastFingerprint = '',
  lastSyncedAt = 0,
  nowMs = Date.now(),
  cooldownMs = 30 * 1000,
  inactiveSnapshot = false,
} = {}) {
  if (!sessionUser?.id) return true
  if (debugEnabled) return true
  if (!fingerprint) return true
  if (inactiveSnapshot) return true

  return (
    fingerprint === lastFingerprint
    && nowMs - Number(lastSyncedAt || 0) < cooldownMs
  )
}
