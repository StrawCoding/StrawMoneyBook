import appPackage from '../../../package.json'
import {
  isSupported as isGooglePlayBillingSupported,
  invalidateBillingCache as invalidateGooglePlayBillingCache,
  loadProducts as loadGooglePlayProducts,
  manageSubscriptions as manageGooglePlaySubscriptions,
  purchase as purchaseGooglePlayProduct,
  queryOwned as queryOwnedGooglePlayPurchases,
  redeemPromoCode as redeemGooglePlayPromoCodeInStore,
  restore as restoreGooglePlayPurchases,
} from './google-play-billing.service'

const PLAY_CALL_TRACE_MAX_ENTRIES = 60

const MEMBERSHIP_FREE = 'free'
const MEMBERSHIP_MEMBER = 'member'
const MEMBERSHIP_CACHE_FOREVER = 'forever'

const MEMBERSHIP_SYNC_STATUS_OK = 'ok'
const MEMBERSHIP_SYNC_STATUS_ERROR = 'error'
const MEMBERSHIP_BACKGROUND_SYNC_COOLDOWN_MS = 60 * 1000
const MEMBERSHIP_PRODUCT_DISPLAY_CACHE_TTL_MS = 10 * 60 * 1000
const MEMBERSHIP_PRODUCT_DISPLAY_FETCH_TIMEOUT_MS = 25 * 1000
const MEMBERSHIP_SYNC_RETRY_MAX_ATTEMPTS = 3
const MEMBERSHIP_SYNC_RETRY_DELAY_MS = 1200
const MONTHLY_MEMBERSHIP_EXPIRY_UNKNOWN_GRACE_MS = 12 * 60 * 60 * 1000
const MONTHLY_MEMBERSHIP_SYNC_FAILURE_GRACE_MS = 3 * 24 * 60 * 60 * 1000
const GOOGLE_PLAY_SUPPORT_CACHE_TTL_OK_MS = 2 * 60 * 1000
const GOOGLE_PLAY_SUPPORT_CACHE_TTL_FAIL_MS = 10 * 1000
const GOOGLE_PLAY_SUPPORT_RETRY_DELAY_MS = 800

const FREE_LIMITS = Object.freeze({
  maxLedgers: 1,
  maxAccounts: 3,
  maxSavingsJars: 1,
  maxLoans: 5,
  maxReimbursements: 5,
  aiBookkeepingDaily: 5,
  maxSubscriptions: 1,
})

const LEGACY_GOOGLE_PLAY_MEMBER_STORAGE_KEY = 'straw.membership.google_play.active'
const LEGACY_GOOGLE_PLAY_MEMBER_PLAN_STORAGE_KEY = 'straw.membership.google_play.plan'
const MEMBERSHIP_ENTITLEMENT_STORAGE_KEY = 'straw.membership.entitlement.v2'
const AI_BOOKKEEPING_USAGE_STORAGE_KEY = 'straw.membership.ai_bookkeeping_daily_usage.v1'
let membershipBackgroundSyncInFlight = null
let membershipBackgroundSyncRequestedAt = 0
let membershipSyncInFlight = null
let membershipProductDisplayCache = {
  monthly: null,
  lifetime: null,
}
let membershipProductDisplayCachedAt = 0
let membershipProductDisplayInFlight = null
let googlePlaySupportCache = {
  checkedAt: 0,
  supported: false,
}
const membershipSnapshotListeners = new Set()
const playCallTraceListeners = new Set()
let playCallTraceSeq = 0
let playCallTraceEntries = []
let playCallExecutionQueue = Promise.resolve()
let membershipBenefitsRedirectInFlight = null

const MEMBERSHIP_LIMIT_ERROR_PREFIX = 'MEMBERSHIP_LIMIT_'
const MEMBERSHIP_BENEFITS_ROUTE_PATH = '/settings/membership-benefits'

/**
 * @typedef {'monthly' | 'lifetime' | ''} MembershipPlan
 * @typedef {'free' | 'member'} MembershipTier
 * @typedef {'ok' | 'error'} MembershipSyncStatus
 * @typedef {{
 *   lifetimeOwned: boolean,
 *   monthlyLastVerifiedAt: string,
 *   membershipCacheExpiresAt: string,
 *   lastSyncAt: string,
 *   lastSyncStatus: MembershipSyncStatus,
 *   lastKnownPlan: MembershipPlan
 * }} MembershipEntitlementState
 * @typedef {{
 *   tier: MembershipTier,
 *   plan: MembershipPlan,
 *   active: boolean,
 *   source: string,
 *   reason: string,
 *   lifetimeOwned: boolean,
 *   monthlyLastVerifiedAt: string,
 *   membershipCacheExpiresAt: string,
 *   lastSyncAt: string,
 *   lastSyncStatus: MembershipSyncStatus,
 *   lastKnownPlan: MembershipPlan
 * }} MembershipSnapshot
 */

function isDebugMembershipOverrideEnabled() {
  const env = import.meta.env ?? {}
  const mode = String(env.MODE ?? '').trim().toLowerCase()
  if (mode === 'debug') return true

  const force = String(env.VITE_FORCE_MEMBER_ON_DEBUG ?? '').trim().toLowerCase()
  return force === '1' || force === 'true' || force === 'yes' || force === 'on'
}

function hasFreshGooglePlaySupportCache(nowMs = Date.now()) {
  if (googlePlaySupportCache.checkedAt <= 0) return false
  const ttl = googlePlaySupportCache.supported
    ? GOOGLE_PLAY_SUPPORT_CACHE_TTL_OK_MS
    : GOOGLE_PLAY_SUPPORT_CACHE_TTL_FAIL_MS
  return nowMs - googlePlaySupportCache.checkedAt <= ttl
}

function setGooglePlaySupportCache(supported) {
  googlePlaySupportCache = {
    checkedAt: Date.now(),
    supported: Boolean(supported),
  }
}

export async function isGooglePlayMembershipSupported({ forceRefresh = false } = {}) {
  if (isDebugMembershipOverrideEnabled()) return true

  if (!forceRefresh && hasFreshGooglePlaySupportCache()) {
    return googlePlaySupportCache.supported
  }

  const probe = async () => {
    const supported = await traceGooglePlayCall('support_check', async () => isGooglePlayBillingSupported())
    return Boolean(supported)
  }

  const maxAttempts = 4
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const supported = await probe()
      setGooglePlaySupportCache(supported)
      if (supported) return true
    } catch (_error) {
      setGooglePlaySupportCache(false)
    }

    if (attempt < maxAttempts) {
      await sleep(GOOGLE_PLAY_SUPPORT_RETRY_DELAY_MS * attempt)
    }
  }

  setGooglePlaySupportCache(false)
  return false
}

function getBrowserStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage ?? null
  } catch (_error) {
    return null
  }
}

function toIsoNow() {
  return new Date().toISOString()
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, Math.max(0, Number(delayMs) || 0))
  })
}

function withTimeout(promise, timeoutMs) {
  const safeTimeoutMs = Math.max(1, Number(timeoutMs) || 0)
  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => {
      reject(new Error(`membership_product_display_timeout_${safeTimeoutMs}`))
    }, safeTimeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer != null) {
      globalThis.clearTimeout(timer)
    }
  })
}

function toEpochMs(value) {
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

function toDateKey(dateLike = new Date()) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeGooglePlayPlan(plan) {
  if (plan === 'monthly') return 'monthly'
  if (plan === 'lifetime') return 'lifetime'
  return ''
}

function normalizeSyncStatus(status) {
  return status === MEMBERSHIP_SYNC_STATUS_OK ? MEMBERSHIP_SYNC_STATUS_OK : MEMBERSHIP_SYNC_STATUS_ERROR
}

function createDefaultEntitlementState() {
  return {
    lifetimeOwned: false,
    monthlyLastVerifiedAt: '',
    membershipCacheExpiresAt: '',
    lastSyncAt: '',
    lastSyncStatus: MEMBERSHIP_SYNC_STATUS_ERROR,
    lastKnownPlan: '',
  }
}

function normalizeCacheExpiry(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (text === MEMBERSHIP_CACHE_FOREVER) return MEMBERSHIP_CACHE_FOREVER
  const ms = Date.parse(text)
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toISOString()
}

function toExpiryIso(value) {
  const ms = toEpochMs(value)
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toISOString()
}

function isMembershipCacheValid(state, nowMs = Date.now()) {
  const cacheExpiresAt = String(state.membershipCacheExpiresAt ?? '').trim()
  if (!cacheExpiresAt) return false
  if (cacheExpiresAt === MEMBERSHIP_CACHE_FOREVER) return true
  const expiresMs = Date.parse(cacheExpiresAt)
  if (!Number.isFinite(expiresMs)) return false
  return expiresMs > nowMs
}

function isMonthlySyncFailureGraceActive(state, nowMs = Date.now()) {
  if (normalizeGooglePlayPlan(state?.lastKnownPlan) !== 'monthly') return false
  if (normalizeSyncStatus(state?.lastSyncStatus) !== MEMBERSHIP_SYNC_STATUS_ERROR) return false

  const cacheExpiresAt = String(state?.membershipCacheExpiresAt ?? '').trim()
  if (!cacheExpiresAt || cacheExpiresAt === MEMBERSHIP_CACHE_FOREVER) return false

  const expiresMs = Date.parse(cacheExpiresAt)
  if (!Number.isFinite(expiresMs)) return false

  return nowMs <= (expiresMs + MONTHLY_MEMBERSHIP_SYNC_FAILURE_GRACE_MS)
}

function normalizeEntitlementState(source) {
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

function readEntitlementState(storage) {
  if (!storage) return createDefaultEntitlementState()

  try {
    const raw = storage.getItem(MEMBERSHIP_ENTITLEMENT_STORAGE_KEY)
    if (!raw) return createDefaultEntitlementState()
    return normalizeEntitlementState(JSON.parse(raw))
  } catch (_error) {
    return createDefaultEntitlementState()
  }
}

function writeEntitlementState(storage, state) {
  if (!storage) return
  try {
    storage.setItem(MEMBERSHIP_ENTITLEMENT_STORAGE_KEY, JSON.stringify(normalizeEntitlementState(state)))
  } catch (_error) {
    // Ignore write failures.
  }
}

function migrateLegacyMembershipState(storage) {
  if (!storage) return createDefaultEntitlementState()

  const existingRaw = storage.getItem(MEMBERSHIP_ENTITLEMENT_STORAGE_KEY)
  if (existingRaw) {
    const existingState = readEntitlementState(storage)
    writeEntitlementState(storage, existingState)
    return existingState
  }

  const legacyActiveText = String(storage.getItem(LEGACY_GOOGLE_PLAY_MEMBER_STORAGE_KEY) ?? '').trim().toLowerCase()
  const legacyPlanText = String(storage.getItem(LEGACY_GOOGLE_PLAY_MEMBER_PLAN_STORAGE_KEY) ?? '').trim().toLowerCase()
  const hadLegacyData = legacyActiveText !== '' || legacyPlanText !== ''

  const state = createDefaultEntitlementState()
  const legacyPlan = normalizeGooglePlayPlan(legacyPlanText)
  const legacyActive = legacyActiveText === '1' || legacyActiveText === 'true' || legacyActiveText === MEMBERSHIP_MEMBER

  if (legacyActive) {
    const nowMs = Date.now()
    const nowIso = new Date(nowMs).toISOString()
    state.lastSyncAt = nowIso
    if (legacyPlan === 'lifetime') {
      state.lifetimeOwned = true
      state.lastKnownPlan = 'lifetime'
      state.membershipCacheExpiresAt = MEMBERSHIP_CACHE_FOREVER
      state.lastSyncStatus = MEMBERSHIP_SYNC_STATUS_OK
    } else {
      state.monthlyLastVerifiedAt = nowIso
      state.lastKnownPlan = 'monthly'
      state.membershipCacheExpiresAt = ''
      state.lastSyncStatus = MEMBERSHIP_SYNC_STATUS_ERROR
    }
  }

  if (hadLegacyData) {
    writeEntitlementState(storage, state)
    try {
      storage.removeItem(LEGACY_GOOGLE_PLAY_MEMBER_STORAGE_KEY)
      storage.removeItem(LEGACY_GOOGLE_PLAY_MEMBER_PLAN_STORAGE_KEY)
    } catch (_error) {
      // Ignore remove failures.
    }
  }

  return state
}

function getEntitlementState() {
  const storage = getBrowserStorage()
  return migrateLegacyMembershipState(storage)
}

function saveEntitlementState(state) {
  const storage = getBrowserStorage()
  writeEntitlementState(storage, state)
}
function clonePlayCallTraceEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  return {
    id: String(entry.id ?? ''),
    operation: String(entry.operation ?? ''),
    startedAt: String(entry.startedAt ?? ''),
    endedAt: String(entry.endedAt ?? ''),
    durationMs: Number.isFinite(Number(entry.durationMs)) ? Number(entry.durationMs) : null,
    status: String(entry.status ?? ''),
    errorCode: String(entry.errorCode ?? ''),
    errorMessage: String(entry.errorMessage ?? ''),
  }
}

function trimPlayCallTraceEntries() {
  if (playCallTraceEntries.length <= PLAY_CALL_TRACE_MAX_ENTRIES) return
  playCallTraceEntries = playCallTraceEntries.slice(0, PLAY_CALL_TRACE_MAX_ENTRIES)
}

function notifyPlayCallTraceListeners() {
  if (!playCallTraceListeners.size) return
  const snapshot = getGooglePlayCallTraceSnapshot()
  for (const listener of playCallTraceListeners) {
    try {
      listener(snapshot)
    } catch (_error) {
      // Ignore listener errors to avoid breaking membership flow.
    }
  }
}

function beginGooglePlayCallTrace(operation) {
  const nowMs = Date.now()
  const entry = {
    id: `play_call_${nowMs}_${playCallTraceSeq++}`,
    operation: String(operation ?? '').trim() || 'unknown',
    startedAt: new Date(nowMs).toISOString(),
    endedAt: '',
    durationMs: null,
    status: 'running',
    errorCode: '',
    errorMessage: '',
  }

  playCallTraceEntries = [entry, ...playCallTraceEntries]
  trimPlayCallTraceEntries()
  notifyPlayCallTraceListeners()
  return {
    entry,
    startedAtMs: nowMs,
  }
}

function endGooglePlayCallTrace(context, { status, error = null } = {}) {
  if (!context?.entry) return

  const endedAtMs = Date.now()
  context.entry.endedAt = new Date(endedAtMs).toISOString()
  context.entry.durationMs = Math.max(0, endedAtMs - Number(context.startedAtMs || endedAtMs))
  context.entry.status = status === 'ok' ? 'ok' : 'error'

  if (context.entry.status === 'error') {
    context.entry.errorCode = String(error?.code ?? '').trim().toUpperCase()
    context.entry.errorMessage = String(error?.message ?? error ?? '').trim()
  } else {
    context.entry.errorCode = ''
    context.entry.errorMessage = ''
  }

  notifyPlayCallTraceListeners()
}

async function traceGooglePlayCall(operation, task) {
  const run = async () => {
    const context = beginGooglePlayCallTrace(operation)
    try {
      const result = await task()
      endGooglePlayCallTrace(context, { status: 'ok' })
      return result
    } catch (error) {
      endGooglePlayCallTrace(context, { status: 'error', error })
      throw error
    }
  }

  const currentRun = playCallExecutionQueue.then(run, run)
  playCallExecutionQueue = currentRun.catch(() => undefined)
  return currentRun
}

export function getGooglePlayCallTraceSnapshot() {
  return playCallTraceEntries
    .map(clonePlayCallTraceEntry)
    .filter(Boolean)
}

export function subscribeGooglePlayCallTrace(listener, { emitCurrent = true } = {}) {
  if (typeof listener !== 'function') {
    return () => {}
  }

  playCallTraceListeners.add(listener)
  if (emitCurrent) {
    try {
      listener(getGooglePlayCallTraceSnapshot())
    } catch (_error) {
      // Ignore listener errors to avoid breaking subscription flow.
    }
  }

  return () => {
    playCallTraceListeners.delete(listener)
  }
}

function getTierAndPlanFromState(state) {
  const nowMs = Date.now()

  if (isDebugMembershipOverrideEnabled()) {
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

function toMembershipSnapshot(state, reason = '') {
  const normalized = normalizeEntitlementState(state)
  const tierResult = getTierAndPlanFromState(normalized)

  return {
    tier: tierResult.tier,
    plan: tierResult.plan,
    active: tierResult.tier === MEMBERSHIP_MEMBER,
    source: tierResult.source,
    reason: String(reason ?? ''),
    lifetimeOwned: normalized.lifetimeOwned,
    monthlyLastVerifiedAt: normalized.monthlyLastVerifiedAt,
    membershipCacheExpiresAt: normalized.membershipCacheExpiresAt,
    lastSyncAt: normalized.lastSyncAt,
    lastSyncStatus: normalized.lastSyncStatus,
    lastKnownPlan: normalized.lastKnownPlan,
  }
}

function notifyMembershipSnapshot(snapshot) {
  if (!membershipSnapshotListeners.size) return
  for (const listener of membershipSnapshotListeners) {
    try {
      listener(snapshot)
    } catch (_error) {
      // Ignore listener errors to avoid breaking membership flow.
    }
  }
}

function commitEntitlementState(state, reason = '') {
  saveEntitlementState(state)
  const snapshot = toMembershipSnapshot(state, reason)
  notifyMembershipSnapshot(snapshot)
  return snapshot
}

function resolveMonthlyCacheExpiry(ownedMonthly, previousState, nowMs = Date.now()) {
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

function resolveMonthlyCacheExpiryFromPurchaseResult(purchaseResult, previousState, nowMs = Date.now()) {
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

function readAiUsageMap(storage) {
  if (!storage) return {}
  try {
    const raw = storage.getItem(AI_BOOKKEEPING_USAGE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_error) {
    return {}
  }
}

function writeAiUsageMap(storage, usageMap) {
  if (!storage) return
  try {
    storage.setItem(AI_BOOKKEEPING_USAGE_STORAGE_KEY, JSON.stringify(usageMap))
  } catch (_error) {
    // Ignore write failures (e.g. private mode quota).
  }
}

function normalizeUsageCount(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}

function createMembershipLimitError(message, code = 'GENERAL') {
  const error = new Error(String(message ?? '').trim() || '已達免費版使用限制')
  error.code = `${MEMBERSHIP_LIMIT_ERROR_PREFIX}${String(code ?? 'GENERAL').trim().toUpperCase() || 'GENERAL'}`
  return error
}

export function isMembershipLimitError(error) {
  const code = String(error?.code ?? '').trim().toUpperCase()
  if (code.startsWith(MEMBERSHIP_LIMIT_ERROR_PREFIX)) return true
  const message = String(error?.message ?? '').trim()
  return message.startsWith('免費版')
}

function triggerMembershipBenefitsRedirect(reason = 'limit_reached') {
  if (typeof window === 'undefined') return
  if (membershipBenefitsRedirectInFlight) return

  membershipBenefitsRedirectInFlight = Promise.resolve()
    .then(async () => {
      const routerModule = await import('@/ui/router')
      const router = routerModule?.default
      if (!router) return
      const currentPath = String(router.currentRoute?.value?.path ?? '')
      if (currentPath === MEMBERSHIP_BENEFITS_ROUTE_PATH) return
      await router.push({
        path: MEMBERSHIP_BENEFITS_ROUTE_PATH,
        query: {
          from: String(reason ?? 'limit_reached'),
        },
      })
    })
    .catch(() => {
      // Ignore routing failures to avoid blocking business flow.
    })
    .finally(() => {
      membershipBenefitsRedirectInFlight = null
    })
}

function isTransientStoreError(error) {
  const code = String(error?.code ?? '').trim().toUpperCase()
  if (code === 'STORE_UNAVAILABLE') return true

  const message = String(error?.message ?? '').toLowerCase()
  return message.includes('逾時') || message.includes('timeout')
}

export function getAppVersion() {
  return String(appPackage?.version ?? '0.0.0')
}

export function getAppVersionMajor() {
  const majorText = getAppVersion().split('.')[0]
  const major = Number(majorText)
  if (!Number.isFinite(major) || major < 0) return 0
  return Math.floor(major)
}

export async function syncMembershipEntitlements(reason = 'manual') {
  if (membershipSyncInFlight) {
    return membershipSyncInFlight
  }

  membershipSyncInFlight = (async () => {
    const previousState = getEntitlementState()

    if (isDebugMembershipOverrideEnabled()) {
      return toMembershipSnapshot(previousState, reason)
    }

    let playSupported = await isGooglePlayMembershipSupported()
    if (!playSupported) {
      playSupported = await isGooglePlayMembershipSupported({ forceRefresh: true })
    }

    if (!playSupported) {
      const unsupportedState = {
        ...previousState,
        lastSyncAt: toIsoNow(),
        lastSyncStatus: MEMBERSHIP_SYNC_STATUS_ERROR,
      }
      return commitEntitlementState(unsupportedState, `${reason}_billing_unsupported`)
    }

    try {
      const owned = await traceGooglePlayCall('query_owned', async () => queryOwnedGooglePlayPurchases())
      const nowMs = Date.now()
      const nowIso = new Date(nowMs).toISOString()

      const nextState = {
        ...previousState,
        lastSyncAt: nowIso,
        lastSyncStatus: MEMBERSHIP_SYNC_STATUS_OK,
        lifetimeOwned: previousState.lifetimeOwned || Boolean(owned?.hasLifetime),
      }

      if (nextState.lifetimeOwned) {
        nextState.lastKnownPlan = 'lifetime'
        nextState.membershipCacheExpiresAt = MEMBERSHIP_CACHE_FOREVER
      } else if (owned?.hasMonthly) {
        nextState.monthlyLastVerifiedAt = nowIso
        nextState.lastKnownPlan = 'monthly'
        nextState.membershipCacheExpiresAt = resolveMonthlyCacheExpiry(owned?.monthly, previousState, nowMs)
      } else {
        nextState.monthlyLastVerifiedAt = ''
        nextState.lastKnownPlan = ''
        nextState.membershipCacheExpiresAt = ''
      }

      return commitEntitlementState(nextState, reason)
    } catch (error) {
      // Invalidate play support cache so next sync re-checks connection
      googlePlaySupportCache = { checkedAt: 0, supported: false }
      const failedState = {
        ...previousState,
        lastSyncAt: toIsoNow(),
        lastSyncStatus: MEMBERSHIP_SYNC_STATUS_ERROR,
      }
      return commitEntitlementState(failedState, reason || String(error?.message ?? 'sync_failed'))
    }
  })().finally(() => {
    membershipSyncInFlight = null
  })

  return membershipSyncInFlight
}

async function syncMembershipEntitlementsWithRetry(
  reason,
  {
    attempts = MEMBERSHIP_SYNC_RETRY_MAX_ATTEMPTS,
    retryDelayMs = MEMBERSHIP_SYNC_RETRY_DELAY_MS,
  } = {},
) {
  const maxAttempts = Math.max(1, Math.floor(Number(attempts) || 1))
  const nextReason = String(reason ?? 'manual')
  let snapshot = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptReason = maxAttempts > 1 ? `${nextReason}_attempt_${attempt}` : nextReason
    snapshot = await syncMembershipEntitlements(attemptReason)
    if (snapshot?.tier === MEMBERSHIP_MEMBER) {
      return snapshot
    }
    if (attempt < maxAttempts && retryDelayMs > 0) {
      await sleep(retryDelayMs)
    }
  }

  return snapshot ?? toMembershipSnapshot(getEntitlementState(), nextReason)
}

function triggerBackgroundMembershipSync(reason = 'background_read') {
  if (isDebugMembershipOverrideEnabled()) return

  if (membershipBackgroundSyncInFlight) return

  const nowMs = Date.now()
  if (nowMs - membershipBackgroundSyncRequestedAt < MEMBERSHIP_BACKGROUND_SYNC_COOLDOWN_MS) {
    return
  }
  membershipBackgroundSyncRequestedAt = nowMs

  membershipBackgroundSyncInFlight = syncMembershipEntitlements(reason)
    .catch(() => null)
    .finally(() => {
      membershipBackgroundSyncInFlight = null
    })
}

export function getMembershipTier() {
  triggerBackgroundMembershipSync('membership_tier_read')
  return toMembershipSnapshot(getEntitlementState()).tier
}

export function getMembershipTierSnapshot() {
  return toMembershipSnapshot(getEntitlementState()).tier
}

export function subscribeMembershipSnapshot(listener, { emitCurrent = true } = {}) {
  if (typeof listener !== 'function') {
    return () => {}
  }

  membershipSnapshotListeners.add(listener)
  if (emitCurrent) {
    try {
      listener(toMembershipSnapshot(getEntitlementState(), 'listener_init'))
    } catch (_error) {
      // Ignore listener errors to avoid breaking subscription flow.
    }
  }

  return () => {
    membershipSnapshotListeners.delete(listener)
  }
}

export function isFreeTier() {
  return getMembershipTierSnapshot() === MEMBERSHIP_FREE
}

export function getGooglePlayMembershipInfo() {
  triggerBackgroundMembershipSync('membership_info_read')
  const snapshot = toMembershipSnapshot(getEntitlementState())
  return {
    active: snapshot.active,
    plan: snapshot.plan,
  }
}

function normalizeProductDisplay(display) {
  if (!display || typeof display !== 'object') {
    return {
      monthly: null,
      lifetime: null,
    }
  }
  return {
    monthly: display.monthly ?? null,
    lifetime: display.lifetime ?? null,
  }
}

function setMembershipProductDisplayCache(display) {
  membershipProductDisplayCache = normalizeProductDisplay(display)
  membershipProductDisplayCachedAt = Date.now()
  return membershipProductDisplayCache
}

function getEmptyProductDisplay() {
  return {
    monthly: null,
    lifetime: null,
  }
}

function hasMembershipProductDisplayCache() {
  return membershipProductDisplayCachedAt > 0
}

function isMembershipProductDisplayCacheFresh(nowMs = Date.now()) {
  if (!hasMembershipProductDisplayCache()) return false
  return nowMs - membershipProductDisplayCachedAt <= MEMBERSHIP_PRODUCT_DISPLAY_CACHE_TTL_MS
}

async function fetchMembershipProductDisplay({ force = false } = {}) {
  let supported = await isGooglePlayMembershipSupported({ forceRefresh: force })
  if (!supported && !force) {
    supported = await isGooglePlayMembershipSupported({ forceRefresh: true })
  }
  if (!supported) {
    return getEmptyProductDisplay()
  }

  if (!force && isMembershipProductDisplayCacheFresh()) {
    return membershipProductDisplayCache
  }

  if (membershipProductDisplayInFlight) {
    return membershipProductDisplayInFlight
  }

  membershipProductDisplayInFlight = traceGooglePlayCall('load_products', async () => loadGooglePlayProducts())
    .then((display) => setMembershipProductDisplayCache(display))
    .catch(() => {
      // Invalidate support cache so next fetch re-establishes connection
      googlePlaySupportCache = { checkedAt: 0, supported: false }
      if (hasMembershipProductDisplayCache()) {
        return membershipProductDisplayCache
      }
      return getEmptyProductDisplay()
    })
    .finally(() => {
      membershipProductDisplayInFlight = null
    })

  return membershipProductDisplayInFlight
}

export function getMembershipProductDisplaySnapshot() {
  if (!hasMembershipProductDisplayCache()) {
    return getEmptyProductDisplay()
  }
  return membershipProductDisplayCache
}

export async function getMembershipProductDisplay() {
  if (isMembershipProductDisplayCacheFresh()) {
    return membershipProductDisplayCache
  }

  if (hasMembershipProductDisplayCache()) {
    void fetchMembershipProductDisplay({ force: true })
    return membershipProductDisplayCache
  }

  return fetchMembershipProductDisplay({ force: true })
}

export async function warmupMembershipRuntime(reason = 'app_open') {
  // Invalidate both billing caches — the native BillingClient may have
  // disconnected while the app was backgrounded / closed, but the JS
  // context (and its module-level cache variables) survives. Clearing
  // the caches forces ensureBillingSupported() to re-establish the
  // connection before any Play API call.
  googlePlaySupportCache = { checkedAt: 0, supported: false }
  invalidateGooglePlayBillingCache()

  // Sequential execution is required — Android BillingClient does not
  // support concurrent startConnection() calls.  Running sync first
  // establishes the connection, then loadProducts can reuse it.
  try {
    await syncMembershipEntitlements(reason)
  } catch (_error) {
    // Non-fatal — continue to product display loading even if sync failed.
  }

  try {
    await fetchMembershipProductDisplay({ force: false })
  } catch (_error) {
    // Non-fatal — product prices may not be available on error.
  }
}

export async function subscribeGooglePlayMembership(plan) {
  const normalizedPlan = normalizeGooglePlayPlan(String(plan ?? '').trim().toLowerCase())
  if (!normalizedPlan) {
    throw new Error('無效的 Google Play 訂閱方案')
  }

  const purchaseResult = await (async () => {
    try {
      return await traceGooglePlayCall(`purchase_${normalizedPlan}`, async () => purchaseGooglePlayProduct(normalizedPlan))
    } catch (error) {
      if (!isTransientStoreError(error)) {
        throw error
      }
      await sleep(MEMBERSHIP_SYNC_RETRY_DELAY_MS)
      return traceGooglePlayCall(`purchase_${normalizedPlan}_retry`, async () => purchaseGooglePlayProduct(normalizedPlan))
    }
  })()
  let snapshot = await syncMembershipEntitlementsWithRetry(`purchase_${normalizedPlan}`)

  if (snapshot.tier !== MEMBERSHIP_MEMBER) {
    const nowMs = Date.now()
    const nowIso = new Date(nowMs).toISOString()
    const currentState = getEntitlementState()
    const fallbackState = {
      ...currentState,
      lastSyncAt: nowIso,
      lastSyncStatus: MEMBERSHIP_SYNC_STATUS_ERROR,
    }

    if (normalizedPlan === 'lifetime') {
      fallbackState.lifetimeOwned = true
      fallbackState.lastKnownPlan = 'lifetime'
      fallbackState.membershipCacheExpiresAt = MEMBERSHIP_CACHE_FOREVER
      fallbackState.monthlyLastVerifiedAt = ''
    } else {
      const purchaseExpiryIso = resolveMonthlyCacheExpiryFromPurchaseResult(purchaseResult, currentState, nowMs)
      if (purchaseExpiryIso) {
        fallbackState.monthlyLastVerifiedAt = nowIso
        fallbackState.lastKnownPlan = 'monthly'
        fallbackState.membershipCacheExpiresAt = purchaseExpiryIso
      }
    }

    snapshot = commitEntitlementState(fallbackState, `purchase_fallback_${normalizedPlan}`)
    triggerBackgroundMembershipSync(`purchase_verify_${normalizedPlan}`)
  }

  return snapshot
}

export async function restoreGooglePlayMembership() {
  await traceGooglePlayCall('restore_purchases', async () => restoreGooglePlayPurchases())
  return syncMembershipEntitlementsWithRetry('restore')
}

export async function openGooglePlaySubscriptionManagement() {
  await traceGooglePlayCall('manage_subscriptions', async () => manageGooglePlaySubscriptions())
}

export async function redeemGooglePlayPromoCode(code) {
  await traceGooglePlayCall('redeem_promo_code', async () => redeemGooglePlayPromoCodeInStore(code))
}

function toMembershipLimitsByTier(tier) {
  if (tier === MEMBERSHIP_FREE) {
    return { ...FREE_LIMITS }
  }
  return {
    maxLedgers: Number.POSITIVE_INFINITY,
    maxAccounts: Number.POSITIVE_INFINITY,
    maxSavingsJars: Number.POSITIVE_INFINITY,
    maxLoans: Number.POSITIVE_INFINITY,
    maxReimbursements: Number.POSITIVE_INFINITY,
    maxSubscriptions: Number.POSITIVE_INFINITY,
    aiBookkeepingDaily: Number.POSITIVE_INFINITY,
  }
}

export function getMembershipLimits(tierOverride = '') {
  const normalizedTier = String(tierOverride ?? '').trim().toLowerCase()
  if (normalizedTier === MEMBERSHIP_FREE || normalizedTier === MEMBERSHIP_MEMBER) {
    return toMembershipLimitsByTier(normalizedTier)
  }
  return toMembershipLimitsByTier(isFreeTier() ? MEMBERSHIP_FREE : MEMBERSHIP_MEMBER)
}

export function assertCanCreateLedger(existingLedgerCount) {
  const count = normalizeUsageCount(existingLedgerCount)
  const { maxLedgers } = getMembershipLimits()
  if (count >= maxLedgers) {
    const error = createMembershipLimitError('免費版最多可建立 1 個帳本', 'LEDGER_CREATE')
    triggerMembershipBenefitsRedirect('ledger_create')
    throw error
  }
}

export function assertCanCreateAccount(existingAccountCount) {
  const count = normalizeUsageCount(existingAccountCount)
  const { maxAccounts } = getMembershipLimits()
  if (count >= maxAccounts) {
    const error = createMembershipLimitError('免費版帳戶最多 3 個', 'ACCOUNT_CREATE')
    triggerMembershipBenefitsRedirect('account_create')
    throw error
  }
}

export function assertCanCreateSavingsJar(existingSavingsJarCount) {
  const count = normalizeUsageCount(existingSavingsJarCount)
  const { maxSavingsJars } = getMembershipLimits()
  if (count >= maxSavingsJars) {
    const error = createMembershipLimitError('免費版存錢罐最多 1 個', 'SAVINGS_JAR_CREATE')
    triggerMembershipBenefitsRedirect('savings_jar_create')
    throw error
  }
}

export function assertCanCreateLoan(existingLoanCount) {
  const count = normalizeUsageCount(existingLoanCount)
  const { maxLoans } = getMembershipLimits()
  if (count >= maxLoans) {
    const error = createMembershipLimitError('免費版借貸最多 5 筆', 'LOAN_CREATE')
    triggerMembershipBenefitsRedirect('loan_create')
    throw error
  }
}

export function assertCanCreateReimbursement(existingReimbursementCount) {
  const count = normalizeUsageCount(existingReimbursementCount)
  const { maxReimbursements } = getMembershipLimits()
  if (count >= maxReimbursements) {
    const error = createMembershipLimitError('免費版報銷最多 5 筆', 'REIMBURSEMENT_CREATE')
    triggerMembershipBenefitsRedirect('reimbursement_create')
    throw error
  }
}

export function assertCanCreateSubscription(existingSubscriptionCount) {
  const count = normalizeUsageCount(existingSubscriptionCount)
  const { maxSubscriptions } = getMembershipLimits()
  if (count >= maxSubscriptions) {
    const error = createMembershipLimitError('免費版訂閱項目最多 1 個', 'SUBSCRIPTION_CREATE')
    triggerMembershipBenefitsRedirect('subscription_create')
    throw error
  }
}

export function getAiBookkeepingDailyUsage(now = new Date()) {
  const dateKey = toDateKey(now) || toDateKey(new Date())
  const { aiBookkeepingDaily } = getMembershipLimits()
  if (!Number.isFinite(aiBookkeepingDaily)) {
    return {
      dateKey,
      used: 0,
      remaining: Number.POSITIVE_INFINITY,
      limit: aiBookkeepingDaily,
    }
  }

  const storage = getBrowserStorage()
  const usageMap = readAiUsageMap(storage)
  const used = normalizeUsageCount(usageMap[dateKey])
  return {
    dateKey,
    used,
    remaining: Math.max(0, aiBookkeepingDaily - used),
    limit: aiBookkeepingDaily,
  }
}

export function assertCanUseAiBookkeeping(now = new Date()) {
  const usage = getAiBookkeepingDailyUsage(now)
  if (usage.used >= usage.limit) {
    const error = createMembershipLimitError('免費版 AI 記帳每日最多 5 次', 'AI_BOOKKEEPING_DAILY')
    triggerMembershipBenefitsRedirect('ai_bookkeeping_daily')
    throw error
  }
}

export function recordAiBookkeepingUsage(now = new Date()) {
  const usage = getAiBookkeepingDailyUsage(now)
  if (!Number.isFinite(usage.limit)) return usage

  const storage = getBrowserStorage()
  if (!storage) {
    const used = usage.used + 1
    return {
      ...usage,
      used,
      remaining: Math.max(0, usage.limit - used),
    }
  }

  const usageMap = readAiUsageMap(storage)
  usageMap[usage.dateKey] = usage.used + 1
  writeAiUsageMap(storage, usageMap)
  return getAiBookkeepingDailyUsage(now)
}
