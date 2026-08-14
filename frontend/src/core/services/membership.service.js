import appPackage from '../../../package.json'
import {
  getSharedLedgerSession,
  syncSharedLedgerGooglePlayMembership,
} from '@/services/shared-ledger/backend'
import {
  isSupported as isGooglePlayBillingSupported,
  invalidateBillingCache as invalidateGooglePlayBillingCache,
  loadProducts as loadGooglePlayProducts,
  manageSubscriptions as manageGooglePlaySubscriptions,
  purchase as purchaseGooglePlayProduct,
  queryOwned as queryOwnedGooglePlayPurchases,
  redeemPromoCode as redeemGooglePlayPromoCodeInStore,
  restore as restoreGooglePlayPurchases,
  GOOGLE_PLAY_PRODUCTS,
} from './google-play-billing.service'
import {
  buildMembershipBackendSyncFingerprint as buildMembershipBackendSyncFingerprintValue,
  resolveSharedLedgerMembershipSyncExpiry as resolveSharedLedgerMembershipSyncExpiryValue,
  shouldSkipInactiveMembershipBackendSync as shouldSkipInactiveMembershipBackendSyncValue,
} from './membership-backend-sync.js'
import {
  hasFreshGooglePlaySupportCache as hasFreshGooglePlaySupportCacheValue,
  isDebugMembershipOverrideEnabledFromEnv,
  shouldSkipMembershipBackendSyncTask,
} from './membership-runtime.js'
import {
  createDefaultEntitlementState as createDefaultEntitlementStateValue,
  getTierAndPlanFromState as getTierAndPlanFromStateValue,
  isMembershipCacheValid as isMembershipCacheValidValue,
  isMonthlySyncFailureGraceActive as isMonthlySyncFailureGraceActiveValue,
  normalizeCacheExpiry as normalizeCacheExpiryValue,
  normalizeEntitlementState as normalizeEntitlementStateValue,
  normalizeGooglePlayPlan as normalizeGooglePlayPlanValue,
  normalizeSyncStatus as normalizeSyncStatusValue,
  resolveMonthlyCacheExpiry as resolveMonthlyCacheExpiryValue,
  resolveMonthlyCacheExpiryFromPurchaseResult as resolveMonthlyCacheExpiryFromPurchaseResultValue,
  toExpiryIso as toExpiryIsoValue,
} from './membership-state.js'
import {
  createGooglePlayTraceStore,
} from './membership-google-play-trace.js'
import {
  createMembershipProductDisplayStore,
} from './membership-product-display.js'
import {
  getBrowserStorage,
  migrateLegacyMembershipState,
  readEntitlementState,
  toDateKey,
  writeEntitlementState,
} from './membership-storage.js'
import {
  getDailyUsage,
  normalizeUsageCount,
  recordDailyUsage,
} from './membership-usage.js'

const MEMBERSHIP_FREE = 'free'
const MEMBERSHIP_MEMBER = 'member'
const MEMBERSHIP_CACHE_FOREVER = 'forever'

const MEMBERSHIP_SYNC_STATUS_OK = 'ok'
const MEMBERSHIP_SYNC_STATUS_ERROR = 'error'
const MEMBERSHIP_BACKGROUND_SYNC_COOLDOWN_MS = 60 * 1000
const MEMBERSHIP_PRODUCT_DISPLAY_CACHE_TTL_MS = 10 * 60 * 1000
const MEMBERSHIP_SYNC_RETRY_MAX_ATTEMPTS = 3
const MEMBERSHIP_SYNC_RETRY_DELAY_MS = 1200
const GOOGLE_PLAY_SUPPORT_CACHE_TTL_OK_MS = 2 * 60 * 1000
const GOOGLE_PLAY_SUPPORT_CACHE_TTL_FAIL_MS = 10 * 1000
const GOOGLE_PLAY_SUPPORT_RETRY_DELAY_MS = 800
const MEMBERSHIP_BACKEND_SYNC_COOLDOWN_MS = 30 * 1000

const FREE_LIMITS = Object.freeze({
  maxLedgers: 1,
  maxAccounts: 3,
  maxBankSyncConnections: 0,
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
let lastOwnedPlayPurchaseEvidence = null

function extractPlayPurchaseEvidence(purchase, productType, productId) {
  if (!purchase || typeof purchase !== 'object') return null
  const purchaseToken = String(
    purchase.purchaseToken
    ?? purchase.purchase_token
    ?? purchase.transactionId
    ?? '',
  ).trim()
  if (!purchaseToken) return null
  return {
    purchaseToken,
    productId: String(purchase.productIdentifier ?? purchase.productId ?? productId ?? '').trim(),
    productType,
    orderId: String(purchase.orderId ?? purchase.order_id ?? '').trim(),
  }
}

function rememberOwnedPlayPurchaseEvidence(owned) {
  lastOwnedPlayPurchaseEvidence = {
    lifetime: extractPlayPurchaseEvidence(
      owned?.lifetime,
      'inapp',
      GOOGLE_PLAY_PRODUCTS.lifetime.productIdentifier,
    ),
    monthly: extractPlayPurchaseEvidence(
      owned?.monthly,
      'subs',
      GOOGLE_PLAY_PRODUCTS.monthly.productIdentifier,
    ),
  }
}

function resolvePlayPurchaseEvidenceForSnapshot(snapshot) {
  const plan = normalizeGooglePlayPlan(snapshot?.plan)
  if (plan === 'lifetime') return lastOwnedPlayPurchaseEvidence?.lifetime ?? null
  if (plan === 'monthly') return lastOwnedPlayPurchaseEvidence?.monthly ?? null
  return lastOwnedPlayPurchaseEvidence?.lifetime
    ?? lastOwnedPlayPurchaseEvidence?.monthly
    ?? null
}
let googlePlaySupportCache = {
  checkedAt: 0,
  supported: false,
}
const membershipSnapshotListeners = new Set()
let membershipBackendSyncInFlight = null
let membershipBackendSyncQueued = null
let membershipBackendSyncFingerprint = ''
let membershipBackendSyncSyncedAt = 0
const playTraceStore = createGooglePlayTraceStore({
  maxEntries: 60,
})
const membershipProductDisplayStore = createMembershipProductDisplayStore({
  cacheTtlMs: MEMBERSHIP_PRODUCT_DISPLAY_CACHE_TTL_MS,
})

const MEMBERSHIP_LIMIT_ERROR_PREFIX = 'MEMBERSHIP_LIMIT_'
let membershipLimitNavigationHandler = null

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
  return isDebugMembershipOverrideEnabledFromEnv(import.meta.env ?? {})
}

function hasFreshGooglePlaySupportCache(nowMs = Date.now()) {
  return hasFreshGooglePlaySupportCacheValue(googlePlaySupportCache, {
    nowMs,
    okTtlMs: GOOGLE_PLAY_SUPPORT_CACHE_TTL_OK_MS,
    failTtlMs: GOOGLE_PLAY_SUPPORT_CACHE_TTL_FAIL_MS,
  })
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

function toIsoNow() {
  return new Date().toISOString()
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, Math.max(0, Number(delayMs) || 0))
  })
}

function normalizeGooglePlayPlan(plan) {
  return normalizeGooglePlayPlanValue(plan)
}

function normalizeSyncStatus(status) {
  return normalizeSyncStatusValue(status)
}

function createDefaultEntitlementState() {
  return createDefaultEntitlementStateValue()
}

function normalizeCacheExpiry(value) {
  return normalizeCacheExpiryValue(value)
}

function toExpiryIso(value) {
  return toExpiryIsoValue(value)
}

function isMembershipCacheValid(state, nowMs = Date.now()) {
  return isMembershipCacheValidValue(state, nowMs)
}

function isMonthlySyncFailureGraceActive(state, nowMs = Date.now()) {
  return isMonthlySyncFailureGraceActiveValue(state, nowMs)
}

function normalizeEntitlementState(source) {
  return normalizeEntitlementStateValue(source)
}

function getEntitlementState() {
  const storage = getBrowserStorage()
  return migrateLegacyMembershipState(storage, {
    entitlementStorageKey: MEMBERSHIP_ENTITLEMENT_STORAGE_KEY,
    legacyActiveStorageKey: LEGACY_GOOGLE_PLAY_MEMBER_STORAGE_KEY,
    legacyPlanStorageKey: LEGACY_GOOGLE_PLAY_MEMBER_PLAN_STORAGE_KEY,
    createDefaultEntitlementState,
    normalizeGooglePlayPlan,
    readEntitlementState: (nextStorage) => readEntitlementState(nextStorage, {
      storageKey: MEMBERSHIP_ENTITLEMENT_STORAGE_KEY,
      createDefaultEntitlementState,
      normalizeEntitlementState,
    }),
    writeEntitlementState: (nextStorage, state) => writeEntitlementState(nextStorage, state, {
      storageKey: MEMBERSHIP_ENTITLEMENT_STORAGE_KEY,
      normalizeEntitlementState,
    }),
    membershipCacheForever: MEMBERSHIP_CACHE_FOREVER,
    membershipMember: MEMBERSHIP_MEMBER,
    membershipSyncStatusError: MEMBERSHIP_SYNC_STATUS_ERROR,
    membershipSyncStatusOk: MEMBERSHIP_SYNC_STATUS_OK,
  })
}

function saveEntitlementState(state) {
  const storage = getBrowserStorage()
  writeEntitlementState(storage, state, {
    storageKey: MEMBERSHIP_ENTITLEMENT_STORAGE_KEY,
    normalizeEntitlementState,
  })
}

async function traceGooglePlayCall(operation, task) {
  return playTraceStore.trace(operation, task)
}

export function getGooglePlayCallTraceSnapshot() {
  return playTraceStore.getSnapshot()
}

export function subscribeGooglePlayCallTrace(listener, { emitCurrent = true } = {}) {
  return playTraceStore.subscribe(listener, { emitCurrent })
}

function getTierAndPlanFromState(state) {
  return getTierAndPlanFromStateValue(state, {
    debugEnabled: isDebugMembershipOverrideEnabled(),
    nowMs: Date.now(),
  })
}

function getSharedLedgerMembershipBonus(nowMs = Date.now()) {
  const user = getSharedLedgerSession()?.user
  if (!user || typeof user !== 'object') {
    return {
      active: false,
      expiresAt: '',
      source: '',
    }
  }

  const expiresAt = String(user.membership_bonus_expires_at ?? '').trim()
  if (!expiresAt) {
    return {
      active: false,
      expiresAt: '',
      source: '',
    }
  }

  const expiresMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
    return {
      active: false,
      expiresAt: '',
      source: '',
    }
  }

  return {
    active: true,
    expiresAt: new Date(expiresMs).toISOString(),
    source: String(user.membership_source ?? '').trim() || 'shared_ledger_bonus',
  }
}

function toMembershipSnapshot(state, reason = '') {
  const normalized = normalizeEntitlementState(state)
  const tierResult = getTierAndPlanFromState(normalized)
  const sharedLedgerBonus = getSharedLedgerMembershipBonus()
  const active = tierResult.tier === MEMBERSHIP_MEMBER || sharedLedgerBonus.active
  const tier = active ? MEMBERSHIP_MEMBER : MEMBERSHIP_FREE
  const plan = tierResult.tier === MEMBERSHIP_MEMBER ? tierResult.plan : ''
  const source = tierResult.tier === MEMBERSHIP_MEMBER
    ? tierResult.source
    : sharedLedgerBonus.active
      ? sharedLedgerBonus.source
      : tierResult.source

  return {
    tier,
    plan,
    active,
    source,
    reason: String(reason ?? ''),
    lifetimeOwned: normalized.lifetimeOwned,
    monthlyLastVerifiedAt: normalized.monthlyLastVerifiedAt,
    membershipCacheExpiresAt: normalized.membershipCacheExpiresAt,
    lastSyncAt: normalized.lastSyncAt,
    lastSyncStatus: normalized.lastSyncStatus,
    lastKnownPlan: normalized.lastKnownPlan,
    sharedLedgerBonusActive: sharedLedgerBonus.active,
    sharedLedgerBonusExpiresAt: sharedLedgerBonus.expiresAt,
    sharedLedgerBonusSource: sharedLedgerBonus.source,
  }
}

function resolveSharedLedgerMembershipSyncExpiry(snapshot) {
  return resolveSharedLedgerMembershipSyncExpiryValue(snapshot)
}

function buildMembershipBackendSyncFingerprint(snapshot, sessionUser = null) {
  return buildMembershipBackendSyncFingerprintValue(snapshot, sessionUser)
}

function shouldSkipInactiveMembershipBackendSync(snapshot) {
  return shouldSkipInactiveMembershipBackendSyncValue(snapshot)
}

async function flushSharedLedgerMembershipSyncQueue() {
  while (membershipBackendSyncQueued) {
    const task = membershipBackendSyncQueued
    membershipBackendSyncQueued = null

    const sessionUser = getSharedLedgerSession()?.user ?? null
    if (!sessionUser?.id || isDebugMembershipOverrideEnabled()) {
      continue
    }

    const fingerprint = buildMembershipBackendSyncFingerprint(task.snapshot, sessionUser)
    if (!fingerprint) continue

    const nowMs = Date.now()
    if (shouldSkipMembershipBackendSyncTask({
      sessionUser,
      debugEnabled: isDebugMembershipOverrideEnabled(),
      fingerprint,
      lastFingerprint: membershipBackendSyncFingerprint,
      lastSyncedAt: membershipBackendSyncSyncedAt,
      nowMs,
      cooldownMs: MEMBERSHIP_BACKEND_SYNC_COOLDOWN_MS,
      inactiveSnapshot: shouldSkipInactiveMembershipBackendSync(task.snapshot),
    })) {
      continue
    }

    try {
      await syncSharedLedgerGooglePlayMembership({
        active: Boolean(normalizeGooglePlayPlan(task.snapshot?.plan) && task.snapshot?.active),
        plan: normalizeGooglePlayPlan(task.snapshot?.plan),
        expiresAt: resolveSharedLedgerMembershipSyncExpiry(task.snapshot),
        observedAt: toIsoNow(),
        lastSyncStatus: normalizeSyncStatus(task.snapshot?.lastSyncStatus),
        reason: String(task.reason ?? '').trim(),
        ...(function buildVerifiedPurchasePayload() {
          const evidence = resolvePlayPurchaseEvidenceForSnapshot(task.snapshot)
          if (!evidence?.purchaseToken || !evidence?.productId) return {}
          return {
            purchaseToken: evidence.purchaseToken,
            productId: evidence.productId,
            productType: evidence.productType,
            orderId: evidence.orderId,
          }
        }()),
      })
      membershipBackendSyncFingerprint = fingerprint
      membershipBackendSyncSyncedAt = nowMs
    } catch (_error) {
      // Ignore backend sync errors so membership reads stay non-blocking.
    }
  }
}

function queueSharedLedgerMembershipSync(snapshot, reason = '') {
  if (!getSharedLedgerSession()?.token || isDebugMembershipOverrideEnabled()) return

  membershipBackendSyncQueued = {
    snapshot: cloneMembershipSnapshot(snapshot),
    reason,
  }

  if (membershipBackendSyncInFlight) return

  membershipBackendSyncInFlight = flushSharedLedgerMembershipSyncQueue()
    .catch(() => null)
    .finally(() => {
      membershipBackendSyncInFlight = null
      if (membershipBackendSyncQueued) {
        queueSharedLedgerMembershipSync(membershipBackendSyncQueued.snapshot, membershipBackendSyncQueued.reason)
      }
    })
}

function cloneMembershipSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  return JSON.parse(JSON.stringify(snapshot))
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
  queueSharedLedgerMembershipSync(snapshot, reason)
  return snapshot
}

function resolveMonthlyCacheExpiry(ownedMonthly, previousState, nowMs = Date.now()) {
  return resolveMonthlyCacheExpiryValue(ownedMonthly, previousState, nowMs)
}

function resolveMonthlyCacheExpiryFromPurchaseResult(purchaseResult, previousState, nowMs = Date.now()) {
  return resolveMonthlyCacheExpiryFromPurchaseResultValue(purchaseResult, previousState, nowMs)
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

export function setMembershipLimitNavigationHandler(handler) {
  membershipLimitNavigationHandler = typeof handler === 'function' ? handler : null
}

function notifyMembershipLimitReached(reason, error) {
  try {
    membershipLimitNavigationHandler?.({
      reason: String(reason ?? 'limit_reached'),
      error: error ?? null,
    })
  } catch {
    // Ignore UI-layer navigation failures to avoid blocking domain flow.
  }
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
      rememberOwnedPlayPurchaseEvidence(owned)
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

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('shared-ledger:session-changed', () => {
    const snapshot = toMembershipSnapshot(getEntitlementState(), 'shared_ledger_session_changed')
    notifyMembershipSnapshot(snapshot)
    queueSharedLedgerMembershipSync(snapshot, 'shared_ledger_session_changed')
    triggerBackgroundMembershipSync('shared_ledger_session_changed')
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

async function fetchMembershipProductDisplay({ force = false } = {}) {
  return membershipProductDisplayStore.fetchDisplay({
    force,
    ensureSupported: ({ forceRefresh }) => isGooglePlayMembershipSupported({ forceRefresh }),
    loadDisplay: () => traceGooglePlayCall('load_products', async () => loadGooglePlayProducts()),
    onFetchError: () => {
      // Invalidate support cache so next fetch re-establishes connection.
      googlePlaySupportCache = { checkedAt: 0, supported: false }
    },
  })
}

export function getMembershipProductDisplaySnapshot() {
  return membershipProductDisplayStore.getSnapshot()
}

export async function getMembershipProductDisplay() {
  if (membershipProductDisplayStore.isFresh()) {
    return membershipProductDisplayStore.getSnapshot()
  }

  if (membershipProductDisplayStore.hasCache()) {
    void fetchMembershipProductDisplay({ force: true })
    return membershipProductDisplayStore.getSnapshot()
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
    maxBankSyncConnections: Number.POSITIVE_INFINITY,
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
    notifyMembershipLimitReached('ledger_create', error)
    throw error
  }
}

export function assertCanCreateAccount(existingAccountCount) {
  const count = normalizeUsageCount(existingAccountCount)
  const { maxAccounts } = getMembershipLimits()
  if (count >= maxAccounts) {
    const error = createMembershipLimitError('免費版帳戶最多 3 個', 'ACCOUNT_CREATE')
    notifyMembershipLimitReached('account_create', error)
    throw error
  }
}

export function assertCanCreateSavingsJar(existingSavingsJarCount) {
  const count = normalizeUsageCount(existingSavingsJarCount)
  const { maxSavingsJars } = getMembershipLimits()
  if (count >= maxSavingsJars) {
    const error = createMembershipLimitError('免費版存錢罐最多 1 個', 'SAVINGS_JAR_CREATE')
    notifyMembershipLimitReached('savings_jar_create', error)
    throw error
  }
}

export function assertCanCreateLoan(existingLoanCount) {
  const count = normalizeUsageCount(existingLoanCount)
  const { maxLoans } = getMembershipLimits()
  if (count >= maxLoans) {
    const error = createMembershipLimitError('免費版借貸最多 5 筆', 'LOAN_CREATE')
    notifyMembershipLimitReached('loan_create', error)
    throw error
  }
}

export function assertCanCreateReimbursement(existingReimbursementCount) {
  const count = normalizeUsageCount(existingReimbursementCount)
  const { maxReimbursements } = getMembershipLimits()
  if (count >= maxReimbursements) {
    const error = createMembershipLimitError('免費版報銷最多 5 筆', 'REIMBURSEMENT_CREATE')
    notifyMembershipLimitReached('reimbursement_create', error)
    throw error
  }
}

export function assertCanCreateSubscription(existingSubscriptionCount) {
  const count = normalizeUsageCount(existingSubscriptionCount)
  const { maxSubscriptions } = getMembershipLimits()
  if (count >= maxSubscriptions) {
    const error = createMembershipLimitError('免費版訂閱項目最多 1 個', 'SUBSCRIPTION_CREATE')
    notifyMembershipLimitReached('subscription_create', error)
    throw error
  }
}

export function hasBankSyncMembershipAccess(tierOverride = '') {
  const { maxBankSyncConnections } = getMembershipLimits(tierOverride)
  return Number(maxBankSyncConnections) > 0 || maxBankSyncConnections === Number.POSITIVE_INFINITY
}

export function hasCarrierSyncMembershipAccess(tierOverride = '') {
  return hasBankSyncMembershipAccess(tierOverride)
}

export function assertCanUseBankSync(tierOverride = '') {
  if (!hasBankSyncMembershipAccess(tierOverride)) {
    const error = createMembershipLimitError('銀行同步僅限會員使用', 'BANK_SYNC_ACCESS')
    notifyMembershipLimitReached('bank_sync', error)
    throw error
  }
}

export function assertCanUseCarrierSync(tierOverride = '') {
  if (!hasCarrierSyncMembershipAccess(tierOverride)) {
    const error = createMembershipLimitError('載具同步僅限會員使用', 'CARRIER_SYNC_ACCESS')
    notifyMembershipLimitReached('carrier_sync', error)
    throw error
  }
}

export function getAiBookkeepingDailyUsage(now = new Date()) {
  const { aiBookkeepingDaily } = getMembershipLimits()
  return getDailyUsage({
    now,
    storage: getBrowserStorage(),
    storageKey: AI_BOOKKEEPING_USAGE_STORAGE_KEY,
    toDateKey,
    limit: aiBookkeepingDaily,
  })
}

export function assertCanUseAiBookkeeping(now = new Date()) {
  const usage = getAiBookkeepingDailyUsage(now)
  if (usage.used >= usage.limit) {
    const error = createMembershipLimitError('免費版 AI 記帳每日最多 5 次', 'AI_BOOKKEEPING_DAILY')
    notifyMembershipLimitReached('ai_bookkeeping_daily', error)
    throw error
  }
}

export function recordAiBookkeepingUsage(now = new Date()) {
  return recordDailyUsage({
    now,
    storage: getBrowserStorage(),
    storageKey: AI_BOOKKEEPING_USAGE_STORAGE_KEY,
    toDateKey,
    limit: getMembershipLimits().aiBookkeepingDaily,
  })
}
