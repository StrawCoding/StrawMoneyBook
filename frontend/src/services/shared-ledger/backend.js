import { Capacitor } from '@capacitor/core'
import { translateMessage } from '@/ui/services/i18n.service'
import {
  clearPersistedAuthSession,
  clearStoredTokens,
  getAuthStorageHeaders,
  getStoredAccessToken,
  getStoredRefreshToken,
  hasPersistedAuthIdentity,
  hasPersistedAuthRestoreCandidate,
  readPersistedAuthHint,
  readPersistedAuthSession,
  readPersistedNeedsReauthFlag,
  shouldSendAuthCredentials,
  writePersistedAuthHint,
  writePersistedAuthSession,
  writePersistedNeedsReauthFlag,
} from '@/services/shared-ledger/auth-session-storage'
import { shouldApplyRefreshGeneration } from '@/services/shared-ledger/refresh-generation.js'

const PROD_DEFAULT_SHARED_LEDGER_API_BASE = 'https://api.strawmb.com'
const PROD_DEFAULT_SHARED_LEDGER_INVITE_BASE = 'https://www.strawmb.com/open/shared-ledger'
const EXPLICIT_SHARED_LEDGER_API_BASE = String(import.meta.env.VITE_SHARED_LEDGER_API_BASE_URL ?? '').trim()
const EXPLICIT_SHARED_LEDGER_INVITE_BASE = String(import.meta.env.VITE_SHARED_LEDGER_INVITE_URL ?? '').trim()
const PENDING_INVITE_CODE_STORAGE_KEY = 'straw.shared_ledger_pending_invite_code'
const REQUEST_TIMEOUT_MS = 15_000
const SESSION_RESTORE_COOLDOWN_MS = 60_000
const sessionListeners = new Set()
const API_DISPLAY_NAME = 'StrawMB API'
let ongoingRefreshPromise = null
let ongoingSessionRestorePromise = null
let lastSessionRestoreAt = 0
/** Monotonic epoch so a late /api/auth/refresh response cannot overwrite a newer rotation. */
let refreshGeneration = 0
/** One forced cookie probe per JS lifetime for pre-hint installs (Web tab close). */
let anonymousCookieProbeDone = false
/** Retry cookie restore this session after network/5xx without persisting a false hint. */
let pendingCookieRestoreRetry = false
/** True when profile is kept but access/refresh credentials are invalid and re-login is required. */
let sessionNeedsReauth = false
try {
  sessionNeedsReauth = readPersistedNeedsReauthFlag()
} catch {
  sessionNeedsReauth = false
}
const t = (key, params, fallback) => translateMessage(key, params, fallback)

function setNeedsReauthFlag(value) {
  sessionNeedsReauth = Boolean(value)
  try {
    writePersistedNeedsReauthFlag(sessionNeedsReauth)
  } catch {
    // Ignore storage failures; in-memory flag still gates API/sync.
  }
}

function getAccessToken() {
  return String(readSession()?.token ?? getStoredAccessToken() ?? '').trim()
}

function shouldUseSameOriginLocalApi() {
  if (EXPLICIT_SHARED_LEDGER_API_BASE) return false
  if (Capacitor.getPlatform() !== 'web') return false
  if (typeof window === 'undefined') return false
  const origin = String(window.location?.origin ?? '').trim()
  return /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(origin)
}

function getSharedLedgerApiBase() {
  if (EXPLICIT_SHARED_LEDGER_API_BASE) return EXPLICIT_SHARED_LEDGER_API_BASE
  if (shouldUseSameOriginLocalApi()) return ''
  if (import.meta.env.PROD) return PROD_DEFAULT_SHARED_LEDGER_API_BASE
  return ''
}

function buildApiUrl(path) {
  const normalizedPath = String(path ?? '').trim()
  if (!normalizedPath.startsWith('/')) {
    throw new Error(`invalid backend api path: ${normalizedPath}`)
  }
  const sharedLedgerApiBase = getSharedLedgerApiBase()
  if (!sharedLedgerApiBase) return normalizedPath
  return `${sharedLedgerApiBase.replace(/\/$/, '')}${normalizedPath}`
}

function shouldRequireExplicitApiBase() {
  return !getSharedLedgerApiBase()
}

function getSharedLedgerInviteBase() {
  const configured = EXPLICIT_SHARED_LEDGER_INVITE_BASE || PROD_DEFAULT_SHARED_LEDGER_INVITE_BASE
  return enforceHttpsInviteBase(configured)
}

function enforceHttpsInviteBase(rawBase) {
  const normalized = String(rawBase ?? '').trim() || PROD_DEFAULT_SHARED_LEDGER_INVITE_BASE
  let parsed
  try {
    parsed = new URL(normalized)
  } catch {
    parsed = new URL(PROD_DEFAULT_SHARED_LEDGER_INVITE_BASE)
  }
  const host = String(parsed.hostname ?? '').trim().toLowerCase()
  const isLocalHost = host === 'localhost' || host === '127.0.0.1'
  if (parsed.protocol === 'http:' && !isLocalHost) {
    parsed.protocol = 'https:'
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalHost)) {
    return PROD_DEFAULT_SHARED_LEDGER_INVITE_BASE
  }
  return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '') || PROD_DEFAULT_SHARED_LEDGER_INVITE_BASE
}

function createMissingApiError() {
  const platform = Capacitor.getPlatform()
  const message = platform === 'web'
    ? t('shared_ledger.error.api_unavailable_web')
    : t('shared_ledger.error.api_unavailable_native')
  const error = new Error(message)
  error.code = 'shared_ledger_api_unavailable'
  return error
}

function shouldAttachCookieAuthToRequest(useAuthStorage = false) {
  return Boolean(useAuthStorage) && shouldSendAuthCredentials()
}

function describeNetworkFailure(requestUrl, error) {
  const pageOrigin = typeof window !== 'undefined' ? String(window.location?.origin ?? '').trim() : ''
  const online = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
    ? navigator.onLine
    : null
  const pageProtocol = typeof window !== 'undefined' ? String(window.location?.protocol ?? '').trim() : ''
  const apiProtocol = String(requestUrl ?? '').trim().match(/^[a-z]+:/i)?.[0] ?? ''
  const reasonParts = []

  if (online === false) {
    reasonParts.push(t('shared_ledger.error.device_offline'))
  }
  if (pageProtocol === 'https:' && apiProtocol === 'http:') {
    reasonParts.push(t('shared_ledger.error.mixed_content'))
  }
  if (pageOrigin) {
    reasonParts.push(t('shared_ledger.error.page_origin', { origin: pageOrigin }))
    if (/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(pageOrigin) && /^https:\/\/api\.strawmb\.com(?:\/|$)/i.test(String(requestUrl ?? '').trim())) {
      reasonParts.push(t('shared_ledger.error.localhost_fetch_hint'))
    }
  }
  const causeMessage = String(error?.message ?? '').trim()
  if (causeMessage && !/^failed to fetch$/i.test(causeMessage) && !/^load failed$/i.test(causeMessage)) {
    reasonParts.push(t('shared_ledger.error.browser_message', { message: causeMessage }))
  }

  const reasonSuffix = reasonParts.length ? `（${reasonParts.join('；')}）` : ''
  return t('shared_ledger.error.network_failed', {
    name: API_DISPLAY_NAME,
    url: requestUrl,
    reasonSuffix,
  })
}

function readSession() {
  return readPersistedAuthSession()
}

function readPendingInviteCode() {
  if (typeof localStorage === 'undefined') return ''
  return String(localStorage.getItem(PENDING_INVITE_CODE_STORAGE_KEY) ?? '').trim().toUpperCase()
}

function writePendingInviteCode(inviteCode) {
  if (typeof localStorage === 'undefined') return ''
  const normalizedInviteCode = String(inviteCode ?? '').trim().toUpperCase()
  if (!normalizedInviteCode) {
    localStorage.removeItem(PENDING_INVITE_CODE_STORAGE_KEY)
    return ''
  }
  localStorage.setItem(PENDING_INVITE_CODE_STORAGE_KEY, normalizedInviteCode)
  return normalizedInviteCode
}

function normalizeSessionUser(nextUser, previousUser = null) {
  const source = nextUser && typeof nextUser === 'object' ? nextUser : {}
  const previous = previousUser && typeof previousUser === 'object' ? previousUser : {}
  const authProviders = Array.isArray(source.auth_providers)
    ? source.auth_providers
    : (Array.isArray(previous.auth_providers) ? previous.auth_providers : [])
  return {
    ...previous,
    ...source,
    auth_providers: authProviders,
  }
}

function writeSession(session) {
  if (!session?.user) {
    setNeedsReauthFlag(false)
    clearPersistedAuthSession()
    notifySessionListeners(null)
    return null
  }
  if (!session?.token && !shouldSendAuthCredentials()) {
    setNeedsReauthFlag(false)
    clearPersistedAuthSession()
    notifySessionListeners(null)
    return null
  }
  const previous = readSession()
  const nextSession = writePersistedAuthSession({
    token: String(session.token ?? '').trim(),
    refreshToken: String(session.refreshToken ?? '').trim(),
    user: normalizeSessionUser(session.user, previous?.user ?? null),
  })
  if (nextSession?.token) {
    setNeedsReauthFlag(false)
  }
  notifySessionListeners(nextSession)
  return nextSession
}

function clearAuthTokens({ markNeedsReauth = true } = {}) {
  refreshGeneration += 1
  ongoingRefreshPromise = null
  clearStoredTokens()
  const session = readSession()
  if (markNeedsReauth && session?.user) {
    setNeedsReauthFlag(true)
    // Keep auth hint so cold start still shows identity / needs-reauth, not a blank login form.
    writePersistedAuthHint(true)
  } else if (!session?.user) {
    setNeedsReauthFlag(false)
    writePersistedAuthHint(false)
  }
  notifySessionListeners(session?.user ? session : null)
}

function clearSession() {
  refreshGeneration += 1
  ongoingRefreshPromise = null
  pendingCookieRestoreRetry = false
  setNeedsReauthFlag(false)
  clearPersistedAuthSession()
  notifySessionListeners(null)
}

function notifySessionListeners(session) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('shared-ledger:session-changed'))
  }
  for (const listener of sessionListeners) {
    try {
      listener(session)
    } catch {
      // Ignore listener errors to avoid breaking auth flow.
    }
  }
}

function buildAuthResponseSession(data, previousSession = null) {
  const token = String(data?.access_token ?? data?.token ?? '').trim()
  const user = data?.user
  if (!token || !user) {
    throw new Error(t('shared_ledger.error.auth_response_invalid'))
  }
  const refreshToken = String(
    data?.refresh_token
    ?? data?.refreshToken
    ?? previousSession?.refreshToken
    ?? getStoredRefreshToken()
    ?? '',
  ).trim()
  return {
    token,
    refreshToken,
    user: normalizeSessionUser(user, previousSession?.user ?? null),
  }
}

function shouldPreserveSessionOnRefreshFailure(error) {
  const code = String(error?.code ?? '').trim()
  const status = Number(error?.status ?? 0)
  return (
    code === 'shared_ledger_network_error' ||
    code === 'shared_ledger_api_timeout' ||
    status >= 500
  )
}

async function performRefreshRequest() {
  const generation = ++refreshGeneration
  const session = readSession()
  const refreshToken = String(session?.refreshToken ?? getStoredRefreshToken() ?? '').trim()
  const body = refreshToken ? { refreshToken } : {}

  const data = await requestJson('/api/auth/refresh', {
    method: 'POST',
    body,
    auth: false,
    useAuthStorage: true,
  })
  // A newer refresh (or logout / needs-reauth clear) started while this one
  // was in flight — applying the stale body would revive an already-rotated token.
  if (!shouldApplyRefreshGeneration(generation, refreshGeneration)) {
    return readSession()
  }
  return writeSession(buildAuthResponseSession(data, session))
}

function shouldClearSessionOnRefreshFailure(error) {
  const code = String(error?.code ?? '').trim()
  const status = Number(error?.status ?? 0)
  if (shouldPreserveSessionOnRefreshFailure(error)) return false
  if (status === 401 || code === 'refresh_token_required' || code === 'refresh_token_invalid' || code === 'refresh_token_revoked') {
    return false
  }
  return status >= 400
}

async function tryRefreshSessionOnce({ allowRetry = true } = {}) {
  if (!allowRetry) return null
  const session = readSession()
  const refreshToken = String(session?.refreshToken ?? getStoredRefreshToken() ?? '').trim()
  if (!session?.token && !refreshToken && !shouldSendAuthCredentials()) return null

  if (!ongoingRefreshPromise) {
    ongoingRefreshPromise = performRefreshRequest()
      .then((nextSession) => {
        pendingCookieRestoreRetry = false
        return nextSession
      })
      .catch((error) => {
        if (shouldClearSessionOnRefreshFailure(error)) {
          pendingCookieRestoreRetry = false
          clearSession()
        } else if (shouldPreserveSessionOnRefreshFailure(error)) {
          // Keep memory tokens + profile on network/5xx; do not mark needs-reauth.
          // Remember to retry this JS session if we still have no profile yet.
          if (!readSession()?.user) {
            pendingCookieRestoreRetry = true
          }
        } else {
          pendingCookieRestoreRetry = false
          clearAuthTokens({ markNeedsReauth: true })
        }
        throw error
      })
      .finally(() => {
        ongoingRefreshPromise = null
      })
  }

  return ongoingRefreshPromise
}

async function requestJson(path, { method = 'GET', body, auth = true, _retried = false, useAuthStorage = false } = {}) {
  if (shouldRequireExplicitApiBase()) {
    throw createMissingApiError()
  }

  const attachCookieAuth = shouldAttachCookieAuthToRequest(useAuthStorage)
  const headers = {
    ...(attachCookieAuth ? getAuthStorageHeaders() : {}),
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (auth) {
    const token = readSession()?.token ?? getStoredAccessToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  const requestUrl = buildApiUrl(path)
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeoutId = controller
    ? globalThis.setTimeout(() => {
      controller.abort()
    }, REQUEST_TIMEOUT_MS)
    : null

  let response = null
  try {
    response = await fetch(requestUrl, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: attachCookieAuth ? 'include' : 'same-origin',
      signal: controller?.signal,
    })
  } catch (error) {
    const isTimeout = String(error?.name ?? '') === 'AbortError'
    const nextError = new Error(
      isTimeout
        ? t('shared_ledger.error.request_timeout', { name: API_DISPLAY_NAME, url: requestUrl })
        : describeNetworkFailure(requestUrl, error),
    )
    nextError.code = isTimeout ? 'shared_ledger_api_timeout' : 'shared_ledger_network_error'
    nextError.cause = error
    throw nextError
  } finally {
    if (timeoutId != null) {
      globalThis.clearTimeout(timeoutId)
    }
  }

  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    if (auth && data?.user) {
      updateSessionUser(data.user)
    }
    if (response.status === 401 && auth) {
      const refreshed = await tryRefreshSessionOnce({ allowRetry: !_retried })
      if (refreshed) {
        return requestJson(path, {
          method,
          body,
          auth,
          _retried: true,
        })
      }
    }
    const error = new Error(String(data?.message ?? data?.error ?? text ?? `HTTP ${response.status}`))
    error.code = String(data?.error ?? '')
    error.status = response.status
    error.currentVersion = Number(data?.current_version ?? 0)
    error.retryAfterSeconds = Math.max(0, Number(data?.retry_after_seconds ?? 0) || 0)
    throw error
  }

  if (!data || typeof data !== 'object') {
    throw new Error(t('shared_ledger.error.response_invalid', { name: API_DISPLAY_NAME }))
  }
  if (auth && data.user) {
    updateSessionUser(data.user)
  }
  return data
}

async function requestFormData(path, { method = 'POST', body, auth = false, useAuthStorage = false } = {}) {
  if (shouldRequireExplicitApiBase()) {
    throw createMissingApiError()
  }

  const attachCookieAuth = shouldAttachCookieAuthToRequest(useAuthStorage)
  const headers = {}
  if (auth) {
    const token = readSession()?.token ?? getStoredAccessToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  const requestUrl = buildApiUrl(path)
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeoutId = controller
    ? globalThis.setTimeout(() => {
      controller.abort()
    }, REQUEST_TIMEOUT_MS * 4)
    : null

  let response = null
  try {
    response = await fetch(requestUrl, {
      method,
      headers,
      body,
      credentials: attachCookieAuth ? 'include' : 'same-origin',
      signal: controller?.signal,
    })
  } catch (error) {
    const isTimeout = String(error?.name ?? '') === 'AbortError'
    const nextError = new Error(
      isTimeout
        ? t('shared_ledger.error.request_timeout', { name: API_DISPLAY_NAME, url: requestUrl })
        : describeNetworkFailure(requestUrl, error),
    )
    nextError.code = isTimeout ? 'shared_ledger_api_timeout' : 'shared_ledger_network_error'
    nextError.cause = error
    throw nextError
  } finally {
    if (timeoutId != null) {
      globalThis.clearTimeout(timeoutId)
    }
  }

  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const error = new Error(String(data?.message ?? data?.error ?? text ?? `HTTP ${response.status}`))
    error.code = String(data?.error ?? '')
    error.status = response.status
    throw error
  }

  if (!data || typeof data !== 'object') {
    throw new Error(t('shared_ledger.error.response_invalid', { name: API_DISPLAY_NAME }))
  }
  return data
}

function persistAuthResponse(data) {
  return writeSession(buildAuthResponseSession(data, readSession()))
}

function updateSessionUser(user) {
  const session = readSession()
  if (!user) return null
  if (!session?.user && !hasPersistedAuthIdentity()) return null
  return writeSession({
    token: String(session?.token ?? getStoredAccessToken() ?? '').trim(),
    refreshToken: String(session?.refreshToken ?? getStoredRefreshToken() ?? '').trim(),
    user: normalizeSessionUser(user, session?.user ?? null),
  })
}

export function isSharedLedgerApiConfigured() {
  return !shouldRequireExplicitApiBase()
}

export function getSharedLedgerApiUnavailableMessage() {
  return createMissingApiError().message
}

export function getSharedLedgerSession() {
  return readSession()
}

export function hasSharedLedgerAccessCredentials() {
  const session = readSession()
  if (Boolean(session?.token ?? getStoredAccessToken())) return true
  if (shouldSendAuthCredentials() && Boolean(getStoredRefreshToken())) return true
  return false
}

/**
 * Profile retained after silent refresh failure — UI must show "needs re-login",
 * never silently flip to logged-out. Flag is persisted so cold start after
 * process death does not fake a valid session.
 */
export function needsSharedLedgerReauth() {
  const session = readSession()
  if (!session?.user) return false
  if (sessionNeedsReauth || readPersistedNeedsReauthFlag()) {
    sessionNeedsReauth = true
    return true
  }
  return false
}

export function getSharedLedgerAuthStatus() {
  const session = readSession()
  const user = session?.user ?? null
  const accessToken = getAccessToken()
  const needsReauth = needsSharedLedgerReauth()
  const restoreInFlight = Boolean(ongoingSessionRestorePromise) || Boolean(ongoingRefreshPromise)
  const hasRestoreCandidate = Boolean(user)
    || hasSharedLedgerAccessCredentials()
    || readPersistedAuthHint()
    || pendingCookieRestoreRetry
  // Restoring covers: profile without live token, cookie-hint cold start, or
  // in-flight / deferred cookie probe — never fake "Session valid" or flash login.
  const restoring = !needsReauth
    && !accessToken
    && (
      restoreInFlight
      || (Boolean(user) && (hasSharedLedgerAccessCredentials() || shouldSendAuthCredentials()))
      || (!user && (readPersistedAuthHint() || pendingCookieRestoreRetry))
    )
  // Cookie mode alone must NOT imply API readiness — only a live access token
  // can authorize shared-ledger API / background sync (cookies are auth-only).
  const canUseApi = Boolean(user) && !needsReauth && Boolean(accessToken)
  return {
    user,
    hasProfile: Boolean(user),
    hasCredentials: hasSharedLedgerAccessCredentials(),
    hasRestoreCandidate,
    needsReauth,
    restoring,
    membershipActive: Boolean(user?.membership_active),
    // Keep profile-visible for UX; API callers must use canUseApi / ensure*.
    isAuthenticated: Boolean(user),
    sessionValid: canUseApi,
    canUseApi,
  }
}

export function isSharedLedgerAuthenticated() {
  // Sync/API callers: require a usable access token. Profile retained after
  // refresh failure (or cold start before restore) must not keep sync running.
  return getSharedLedgerAuthStatus().canUseApi
}

/**
 * Await silent restore when profile exists but access token is missing
 * (cold start / process death / tab reload). Returns the latest auth status.
 */
export async function ensureSharedLedgerSessionReady({ force = false } = {}) {
  let status = getSharedLedgerAuthStatus()
  if (status.canUseApi || status.needsReauth) return status
  // Do not probe /api/auth/refresh for anonymous users with no hint/profile —
  // cookie mode alone used to force a refresh on every sync tick.
  if (
    !status.hasProfile
    && !hasSharedLedgerAccessCredentials()
    && !readPersistedAuthHint()
    && !pendingCookieRestoreRetry
    && !hasPersistedAuthRestoreCandidate()
  ) {
    return status
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return status
  }
  try {
    await restoreSharedLedgerSession({ force: force || !status.canUseApi })
  } catch {
    // restore path already marks needs-reauth on auth failure / preserves on network.
  }
  return getSharedLedgerAuthStatus()
}

export function hasSharedLedgerMembershipAccess() {
  return Boolean(readSession()?.user?.membership_active)
}

export function subscribeSharedLedgerSession(listener, { emitCurrent = true } = {}) {
  if (typeof listener !== 'function') {
    return () => {}
  }

  sessionListeners.add(listener)
  if (emitCurrent) {
    try {
      listener(readSession())
    } catch {
      // Ignore listener errors.
    }
  }

  return () => {
    sessionListeners.delete(listener)
  }
}

export async function registerSharedLedgerAccount(payload = {}) {
  const data = await requestJson('/api/auth/register', {
    method: 'POST',
    body: payload,
    auth: false,
    useAuthStorage: true,
  })
  return persistAuthResponse(data)
}

export async function loginSharedLedgerAccount(payload = {}) {
  const data = await requestJson('/api/auth/login', {
    method: 'POST',
    body: payload,
    auth: false,
    useAuthStorage: true,
  })
  return persistAuthResponse(data)
}

export async function prepareSharedLedgerGoogleAuth(payload = {}) {
  const purpose = String(payload?.purpose ?? '').trim()
  return requestJson('/api/auth/google/prepare', {
    method: 'POST',
    body: payload,
    auth: purpose === 'link',
  })
}

export async function loginSharedLedgerWithGoogle(payload = {}) {
  const purpose = String(payload?.purpose ?? '').trim()
  const data = await requestJson('/api/auth/google', {
    method: 'POST',
    body: payload,
    auth: purpose === 'link',
    useAuthStorage: purpose !== 'link',
  })
  return persistAuthResponse(data)
}

export async function requestSharedLedgerPasswordReset(payload = {}) {
  return requestJson('/api/auth/password-reset/request', {
    method: 'POST',
    body: payload,
    auth: false,
  })
}

export async function resetSharedLedgerPassword(payload = {}) {
  const data = await requestJson('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: payload,
    auth: false,
    useAuthStorage: true,
  })
  return persistAuthResponse(data)
}

export async function changeSharedLedgerPassword(payload = {}) {
  const data = await requestJson('/api/auth/password/change', {
    method: 'POST',
    body: payload,
    useAuthStorage: true,
  })
  return persistAuthResponse(data)
}

export async function refreshSharedLedgerSession() {
  const session = readSession()
  if (!session?.token) {
    if (shouldSendAuthCredentials()) {
      return restoreSharedLedgerSession({ force: true })
    }
    return null
  }
  try {
    const data = await requestJson('/api/auth/me')
    return updateSessionUser(data.user)
  } catch (error) {
    if (shouldPreserveSessionOnRefreshFailure(error)) {
      return readSession()
    }
    throw error
  }
}

export async function restoreSharedLedgerSession({ force = false } = {}) {
  const session = readSession()
  if (!session?.token) {
    const canRestore = hasPersistedAuthIdentity()
      || hasSharedLedgerAccessCredentials()
      || readPersistedAuthHint()
      || pendingCookieRestoreRetry
      || hasPersistedAuthRestoreCandidate()
    // Pre-hint Web installs: allow one forced cookie probe per JS lifetime when
    // app_start passes force:true. Never probe solely because cookie mode is on.
    if (!canRestore) {
      if (!(force && shouldSendAuthCredentials() && !anonymousCookieProbeDone)) return null
      anonymousCookieProbeDone = true
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
    if (!force && Date.now() - lastSessionRestoreAt < SESSION_RESTORE_COOLDOWN_MS) return null
    if (!ongoingSessionRestorePromise) {
      lastSessionRestoreAt = Date.now()
      ongoingSessionRestorePromise = tryRefreshSessionOnce()
        .finally(() => {
          ongoingSessionRestorePromise = null
        })
    }
    return ongoingSessionRestorePromise
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return session
  }

  const nowMs = Date.now()
  if (!force && nowMs - lastSessionRestoreAt < SESSION_RESTORE_COOLDOWN_MS) {
    return session
  }

  if (!ongoingSessionRestorePromise) {
    lastSessionRestoreAt = nowMs
    ongoingSessionRestorePromise = (async () => {
      try {
        if (session.refreshToken || shouldSendAuthCredentials()) {
          // Reuse the shared refresh pipeline so app restore and page refresh
          // never rotate the same refresh token in parallel.
          return await tryRefreshSessionOnce()
        }
        return await refreshSharedLedgerSession()
      } catch (error) {
        if (shouldPreserveSessionOnRefreshFailure(error)) {
          return readSession()
        }
        throw error
      } finally {
        ongoingSessionRestorePromise = null
      }
    })()
  }

  return ongoingSessionRestorePromise
}

export async function logoutSharedLedgerAccount() {
  try {
    const session = readSession()
    if (session?.token || hasPersistedAuthIdentity() || shouldSendAuthCredentials()) {
      await requestJson('/api/auth/logout', {
        method: 'POST',
        body: session?.refreshToken ? { refreshToken: session.refreshToken } : {},
        useAuthStorage: true,
        auth: Boolean(session?.token),
      })
    }
  } catch {
    // Ignore logout errors and clear local session anyway.
  } finally {
    clearSession()
  }
}

export async function listSharedLedgers() {
  return requestJson('/api/shared-ledgers')
}

export async function activateSharedLedgerTrial() {
  const data = await requestJson('/api/shared-ledgers/trial/activate', {
    method: 'POST',
  })
  if (data?.user) {
    updateSessionUser(data.user)
  }
  return data
}

export async function createSharedLedger(payload = {}) {
  return requestJson('/api/shared-ledgers', {
    method: 'POST',
    body: payload,
  })
}

export function extractSharedLedgerInviteCode(value) {
  const source = String(value ?? '').trim()
  if (!source) return ''

  const directCode = source.toUpperCase()
  if (/^[A-Z0-9]{6,32}$/.test(directCode)) {
    return directCode
  }

  try {
    const parsed = new URL(source)
    const candidates = [
      parsed.searchParams.get('inviteCode'),
      parsed.searchParams.get('invite_code'),
      parsed.searchParams.get('code'),
    ]
    for (const candidate of candidates) {
      const normalizedCandidate = String(candidate ?? '').trim().toUpperCase()
      if (/^[A-Z0-9]{6,32}$/.test(normalizedCandidate)) {
        return normalizedCandidate
      }
    }
  } catch {
    // Ignore malformed URLs and fall through to empty result.
  }

  return ''
}

export function buildSharedLedgerInviteLink(inviteCode) {
  const normalizedInviteCode = extractSharedLedgerInviteCode(inviteCode)
  if (!normalizedInviteCode) return ''
  const url = new URL(getSharedLedgerInviteBase())
  if (url.protocol !== 'https:') {
    const host = String(url.hostname ?? '').trim().toLowerCase()
    const isLocalHost = host === 'localhost' || host === '127.0.0.1'
    if (!(url.protocol === 'http:' && isLocalHost)) {
      url.protocol = 'https:'
    }
  }
  url.searchParams.set('inviteCode', normalizedInviteCode)
  const link = url.toString()
  if (!/^https:\/\//i.test(link) && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(link)) {
    return `${PROD_DEFAULT_SHARED_LEDGER_INVITE_BASE}?inviteCode=${encodeURIComponent(normalizedInviteCode)}`
  }
  return link
}

export function getPendingSharedLedgerInviteCode() {
  return readPendingInviteCode()
}

export function rememberPendingSharedLedgerInviteCode(value) {
  const normalizedInviteCode = extractSharedLedgerInviteCode(value)
  return writePendingInviteCode(normalizedInviteCode)
}

export function clearPendingSharedLedgerInviteCode() {
  writePendingInviteCode('')
}

export async function joinSharedLedger(inviteCode) {
  const normalizedInviteCode = extractSharedLedgerInviteCode(inviteCode)
  if (!normalizedInviteCode) {
    throw new Error(t('shared_ledger.error.invalid_invite_link'))
  }
  return requestJson('/api/shared-ledgers/join', {
    method: 'POST',
    body: { inviteCode: normalizedInviteCode },
  })
}

export async function getSharedLedgerSnapshot(sharedLedgerId) {
  const normalizedId = String(sharedLedgerId ?? '').trim()
  if (!normalizedId) throw new Error(t('shared_ledger.error.missing_ledger_id'))
  return requestJson(`/api/shared-ledgers/${normalizedId}/snapshot`)
}

export async function getSharedLedgerDetail(sharedLedgerId) {
  const normalizedId = String(sharedLedgerId ?? '').trim()
  if (!normalizedId) throw new Error(t('shared_ledger.error.missing_ledger_id'))
  return requestJson(`/api/shared-ledgers/${normalizedId}`)
}

export async function rotateSharedLedgerInviteCode(sharedLedgerId) {
  const normalizedId = String(sharedLedgerId ?? '').trim()
  if (!normalizedId) throw new Error(t('shared_ledger.error.missing_ledger_id'))
  return requestJson(`/api/shared-ledgers/${normalizedId}/invite-code/rotate`, {
    method: 'POST',
    body: {},
  })
}

export async function pushSharedLedgerSnapshot(sharedLedgerId, payload = {}) {
  const normalizedId = String(sharedLedgerId ?? '').trim()
  if (!normalizedId) throw new Error(t('shared_ledger.error.missing_ledger_id'))
  return requestJson(`/api/shared-ledgers/${normalizedId}/snapshot`, {
    method: 'POST',
    body: payload,
  })
}

export async function deleteSharedLedger(sharedLedgerId) {
  const normalizedId = String(sharedLedgerId ?? '').trim()
  if (!normalizedId) throw new Error(t('shared_ledger.error.missing_ledger_id'))
  return requestJson(`/api/shared-ledgers/${normalizedId}`, {
    method: 'DELETE',
  })
}

export async function updateSharedLedgerProfile(payload = {}) {
  const data = await requestJson('/api/auth/profile', {
    method: 'POST',
    body: payload,
  })
  updateSessionUser(data.user)
  return data
}

export async function syncSharedLedgerGooglePlayMembership(payload = {}) {
  const data = await requestJson('/api/auth/membership/google-play', {
    method: 'POST',
    body: payload,
  })
  if (data?.user) {
    updateSessionUser(data.user)
  }
  return data
}

export async function listPendingSharedLedgerInvitations() {
  return requestJson('/api/shared-ledgers/invitations/pending')
}

export async function listSharedLedgerOutgoingInvitations(sharedLedgerId) {
  const normalizedId = String(sharedLedgerId ?? '').trim()
  if (!normalizedId) throw new Error(t('shared_ledger.error.missing_ledger_id'))
  return requestJson(`/api/shared-ledgers/${normalizedId}/invitations`)
}

export async function inviteSharedLedgerByEmail(sharedLedgerId, email) {
  const normalizedId = String(sharedLedgerId ?? '').trim()
  const normalizedEmail = String(email ?? '').trim()
  if (!normalizedId) throw new Error(t('shared_ledger.error.missing_ledger_id'))
  if (!normalizedEmail) throw new Error(t('shared_ledger.error.missing_invite_email'))
  return requestJson(`/api/shared-ledgers/${normalizedId}/invitations`, {
    method: 'POST',
    body: { email: normalizedEmail },
  })
}

export async function resendSharedLedgerInvitation(sharedLedgerId, invitationId) {
  const normalizedLedgerId = String(sharedLedgerId ?? '').trim()
  const normalizedInvitationId = String(invitationId ?? '').trim()
  if (!normalizedLedgerId) throw new Error(t('shared_ledger.error.missing_ledger_id'))
  if (!normalizedInvitationId) throw new Error(t('shared_ledger.error.missing_invitation_id'))
  return requestJson(`/api/shared-ledgers/${normalizedLedgerId}/invitations/${normalizedInvitationId}/resend`, {
    method: 'POST',
    body: {},
  })
}

export async function acceptSharedLedgerInvitation(invitationId) {
  const normalizedId = String(invitationId ?? '').trim()
  if (!normalizedId) throw new Error(t('shared_ledger.error.missing_invitation_id'))
  return requestJson(`/api/shared-ledgers/invitations/${normalizedId}`, {
    method: 'POST',
  })
}

export async function updateSharedLedgerMemberRole(sharedLedgerId, memberUserId, role) {
  const normalizedLedgerId = String(sharedLedgerId ?? '').trim()
  const normalizedMemberId = String(memberUserId ?? '').trim()
  const normalizedRole = String(role ?? '').trim().toLowerCase()
  if (!normalizedLedgerId) throw new Error(t('shared_ledger.error.missing_ledger_id'))
  if (!normalizedMemberId) throw new Error(t('shared_ledger.error.missing_member_id'))
  return requestJson(`/api/shared-ledgers/${normalizedLedgerId}/members/${normalizedMemberId}/role`, {
    method: 'POST',
    body: { role: normalizedRole },
  })
}

export async function transferSharedLedgerOwnership(sharedLedgerId, targetUserId) {
  const normalizedLedgerId = String(sharedLedgerId ?? '').trim()
  const normalizedTargetId = String(targetUserId ?? '').trim()
  if (!normalizedLedgerId) throw new Error(t('shared_ledger.error.missing_ledger_id'))
  if (!normalizedTargetId) throw new Error(t('shared_ledger.error.missing_member_id'))
  return requestJson(`/api/shared-ledgers/${normalizedLedgerId}/transfer`, {
    method: 'POST',
    body: { targetUserId: normalizedTargetId },
  })
}

export async function getReferralSummary() {
  const data = await requestJson('/api/referrals/me')
  updateSessionUser(data.user)
  return data
}

export async function redeemReferralCode(code) {
  const data = await requestJson('/api/referrals/redeem', {
    method: 'POST',
    body: { code },
  })
  updateSessionUser(data.user)
  return data
}

export async function uploadClientErrorLog(payload = {}) {
  return requestJson('/api/client-logs', {
    method: 'POST',
    body: payload,
    auth: Boolean(readSession()?.token),
  })
}

export async function getAdminOverview() {
  return requestJson('/api/admin')
}

export async function listAdminErrorLogs(reviewStatus = '') {
  const suffix = reviewStatus ? `?reviewStatus=${encodeURIComponent(String(reviewStatus))}` : ''
  return requestJson(`/api/admin/error-logs${suffix}`)
}

export async function reviewAdminErrorLog(logId, payload = {}) {
  const normalizedId = String(logId ?? '').trim()
  if (!normalizedId) throw new Error(t('common.missing_error_log_id', '缺少錯誤紀錄 ID'))
  return requestJson(`/api/admin/error-logs/${normalizedId}/review`, {
    method: 'POST',
    body: payload,
  })
}

export async function updateAdminUserMembership(userId, payload = {}) {
  const normalizedId = String(userId ?? '').trim()
  if (!normalizedId) throw new Error(t('common.missing_user_id', '缺少使用者 ID'))
  const data = await requestJson(`/api/admin/users/${normalizedId}/membership`, {
    method: 'POST',
    body: payload,
  })
  if (normalizedId === String(readSession()?.user?.id ?? '').trim()) {
    await refreshSharedLedgerSession().catch(() => null)
  }
  return data
}

export async function deleteAdminUser(userId) {
  const normalizedId = String(userId ?? '').trim()
  if (!normalizedId) throw new Error(t('common.missing_user_id', '缺少使用者 ID'))
  return requestJson(`/api/admin/users/${normalizedId}`, {
    method: 'DELETE',
  })
}
