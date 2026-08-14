/** Sources that may be recorded as observations but never authorize entitlements. */
export const UNVERIFIED_MEMBERSHIP_SOURCES = Object.freeze([
  'google_play_client_sync',
])

export function isVerifiedMembershipSource(source) {
  const normalized = String(source ?? '').trim()
  if (!normalized) return false
  return !UNVERIFIED_MEMBERSHIP_SOURCES.includes(normalized)
}

export function getMembershipGrantList(user) {
  return Array.isArray(user?.membership_grants) ? user.membership_grants : []
}

export function getMembershipGrantSummary(user, nowMs = Date.now()) {
  const grants = getMembershipGrantList(user)
  let latestGrant = null

  for (const grant of grants) {
    if (!isVerifiedMembershipSource(grant?.source)) continue
    const endAt = String(grant?.end_at ?? '').trim()
    const endMs = Date.parse(endAt)
    if (!Number.isFinite(endMs) || endMs <= nowMs) continue
    if (!latestGrant || endMs > Date.parse(String(latestGrant.end_at ?? ''))) {
      latestGrant = grant
    }
  }

  return {
    active: Boolean(latestGrant),
    expiresAt: latestGrant ? String(latestGrant.end_at ?? '') : '',
    source: latestGrant ? String(latestGrant.source ?? '') : '',
  }
}

export function getLatestMembershipGrantBySource(user, source) {
  const normalizedSource = String(source ?? '').trim()
  if (!normalizedSource) return null

  const grants = getMembershipGrantList(user)
  let latestGrant = null
  let latestEndMs = -1

  for (const grant of grants) {
    if (String(grant?.source ?? '').trim() !== normalizedSource) continue
    const endMs = Date.parse(String(grant?.end_at ?? ''))
    const sortableEndMs = Number.isFinite(endMs) ? endMs : -1
    if (!latestGrant || sortableEndMs > latestEndMs) {
      latestGrant = grant
      latestEndMs = sortableEndMs
    }
  }

  return latestGrant
}

export function applyMembershipGrant(user, days, source, meta = {}, {
  createId,
  nowIso,
  nowMs = Date.now(),
} = {}) {
  const safeDays = Math.max(1, Math.floor(Number(days) || 0))
  const existingGrants = getMembershipGrantList(user)
  const latestEndMs = existingGrants.reduce((max, grant) => {
    const endMs = Date.parse(String(grant?.end_at ?? ''))
    return Number.isFinite(endMs) && endMs > max ? endMs : max
  }, nowMs)
  const startMs = Math.max(nowMs, latestEndMs)
  const endMs = startMs + safeDays * 24 * 60 * 60 * 1000

  const grant = {
    id: createId('membership_grant'),
    days: safeDays,
    source: String(source ?? 'manual').trim() || 'manual',
    start_at: new Date(startMs).toISOString(),
    end_at: new Date(endMs).toISOString(),
    created_at: nowIso(),
    meta,
  }

  user.membership_grants = [...existingGrants, grant]
  user.updated_at = nowIso()
  return grant
}

export function syncMembershipGrantBySource(user, source, {
  active = false,
  startAt = '',
  endAt = '',
  meta = {},
} = {}, {
  createId,
  nowIso,
  createStoreError,
  nowMs = Date.now(),
} = {}) {
  const normalizedSource = String(source ?? '').trim()
  if (!normalizedSource) {
    throw createStoreError('缺少會員來源', 'membership_source_required', 400)
  }

  const existingGrants = getMembershipGrantList(user)
  const keptGrants = existingGrants.filter((grant) => String(grant?.source ?? '').trim() !== normalizedSource)
  const now = nowIso()

  if (!active) {
    user.membership_grants = keptGrants
    user.updated_at = now
    return null
  }

  const endAtMs = Date.parse(String(endAt ?? ''))
  if (!Number.isFinite(endAtMs) || endAtMs <= nowMs) {
    user.membership_grants = keptGrants
    user.updated_at = now
    return null
  }

  const normalizedStartAt = (() => {
    const startAtMs = Date.parse(String(startAt ?? ''))
    if (Number.isFinite(startAtMs) && startAtMs < endAtMs) {
      return new Date(startAtMs).toISOString()
    }
    return now
  })()

  const grant = {
    id: createId('membership_grant'),
    days: Math.max(1, Math.ceil((endAtMs - Date.parse(normalizedStartAt)) / (24 * 60 * 60 * 1000))),
    source: normalizedSource,
    start_at: normalizedStartAt,
    end_at: new Date(endAtMs).toISOString(),
    created_at: now,
    meta,
  }

  user.membership_grants = [...keptGrants, grant]
  user.updated_at = now
  return grant
}
