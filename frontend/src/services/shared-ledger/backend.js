import { Capacitor } from '@capacitor/core'

const PROD_DEFAULT_SHARED_LEDGER_API_BASE = 'https://api.strawmb.com'
const PROD_DEFAULT_SHARED_LEDGER_INVITE_BASE = 'https://www.strawmb.com/open/shared-ledger'
const EXPLICIT_SHARED_LEDGER_API_BASE = String(import.meta.env.VITE_SHARED_LEDGER_API_BASE_URL ?? '').trim()
const EXPLICIT_SHARED_LEDGER_INVITE_BASE = String(import.meta.env.VITE_SHARED_LEDGER_INVITE_URL ?? '').trim()
const SESSION_STORAGE_KEY = 'straw.shared_ledger_session'
const PENDING_INVITE_CODE_STORAGE_KEY = 'straw.shared_ledger_pending_invite_code'
const REQUEST_TIMEOUT_MS = 15_000
const SESSION_RESTORE_COOLDOWN_MS = 60_000
const sessionListeners = new Set()
const API_DISPLAY_NAME = 'StrawMB API'
let ongoingRefreshPromise = null
let ongoingSessionRestorePromise = null
let lastSessionRestoreAt = 0

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
  return EXPLICIT_SHARED_LEDGER_INVITE_BASE || PROD_DEFAULT_SHARED_LEDGER_INVITE_BASE
}

function createMissingApiError() {
  const platform = Capacitor.getPlatform()
  const message = platform === 'web'
    ? `${API_DISPLAY_NAME} 未設定，請啟動 backend Node.js 伺服器，或設定 VITE_SHARED_LEDGER_API_BASE_URL`
    : `手機 App 需設定 ${API_DISPLAY_NAME} URL，請先部署後端並設定 VITE_SHARED_LEDGER_API_BASE_URL`
  const error = new Error(message)
  error.code = 'shared_ledger_api_unavailable'
  return error
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
    reasonParts.push('裝置目前離線')
  }
  if (pageProtocol === 'https:' && apiProtocol === 'http:') {
    reasonParts.push('目前頁面是 HTTPS，但 API 是 HTTP，瀏覽器會擋下混合內容')
  }
  if (pageOrigin) {
    reasonParts.push(`頁面來源：${pageOrigin}`)
    if (/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(pageOrigin) && /^https:\/\/api\.strawmb\.com(?:\/|$)/i.test(String(requestUrl ?? '').trim())) {
      reasonParts.push('若正式 API 已允許 localhost，仍出現 Failed to fetch 時，通常是預檢請求被限流、反向代理擋掉 OPTIONS，或 HTTPS / 憑證問題')
    }
  }
  const causeMessage = String(error?.message ?? '').trim()
  if (causeMessage && !/^failed to fetch$/i.test(causeMessage) && !/^load failed$/i.test(causeMessage)) {
    reasonParts.push(`瀏覽器訊息：${causeMessage}`)
  }

  const reasonSuffix = reasonParts.length ? `（${reasonParts.join('；')}）` : ''
  return `無法連線 ${API_DISPLAY_NAME}：${requestUrl}${reasonSuffix}`
}

function readSession() {
  if (typeof localStorage === 'undefined') return null
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null')
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.token || !parsed.user) return null
    return parsed
  } catch {
    return null
  }
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
  if (typeof localStorage === 'undefined') return null
  if (!session?.token || !session?.user) {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    notifySessionListeners(null)
    return null
  }
  const previous = readSession()
  const nextSession = {
    ...session,
    refreshToken: String(session.refreshToken ?? '').trim(),
    user: normalizeSessionUser(session.user, previous?.user ?? null),
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession))
  notifySessionListeners(nextSession)
  return nextSession
}

function clearSession() {
  if (typeof localStorage === 'undefined') return
  ongoingRefreshPromise = null
  localStorage.removeItem(SESSION_STORAGE_KEY)
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
    throw new Error('帳號登入回應格式錯誤')
  }
  return {
    token,
    refreshToken: String(
      data?.refresh_token
      ?? data?.refreshToken
      ?? previousSession?.refreshToken
      ?? '',
    ).trim(),
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
  const session = readSession()
  const refreshToken = String(session?.refreshToken ?? '').trim()
  if (!refreshToken) return null

  const data = await requestJson('/api/auth/refresh', {
    method: 'POST',
    body: {
      refreshToken,
    },
    auth: false,
  })
  return writeSession(buildAuthResponseSession(data, session))
}

async function tryRefreshSessionOnce({ allowRetry = true } = {}) {
  if (!allowRetry) return null
  const session = readSession()
  if (!session?.refreshToken) return null

  if (!ongoingRefreshPromise) {
    ongoingRefreshPromise = performRefreshRequest()
      .catch((error) => {
        if (!shouldPreserveSessionOnRefreshFailure(error)) {
          clearSession()
        }
        throw error
      })
      .finally(() => {
        ongoingRefreshPromise = null
      })
  }

  return ongoingRefreshPromise
}

async function requestJson(path, { method = 'GET', body, auth = true, _retried = false } = {}) {
  if (shouldRequireExplicitApiBase()) {
    throw createMissingApiError()
  }

  const headers = {}
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (auth) {
    const token = readSession()?.token
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
      signal: controller?.signal,
    })
  } catch (error) {
    const isTimeout = String(error?.name ?? '') === 'AbortError'
    const nextError = new Error(
      isTimeout
        ? `${API_DISPLAY_NAME} 連線逾時：${requestUrl}`
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
      clearSession()
    }
    const error = new Error(String(data?.message ?? data?.error ?? text ?? `HTTP ${response.status}`))
    error.code = String(data?.error ?? '')
    error.status = response.status
    error.currentVersion = Number(data?.current_version ?? 0)
    error.retryAfterSeconds = Math.max(0, Number(data?.retry_after_seconds ?? 0) || 0)
    throw error
  }

  if (!data || typeof data !== 'object') {
    throw new Error(`${API_DISPLAY_NAME} 回應格式錯誤`)
  }
  if (auth && data.user) {
    updateSessionUser(data.user)
  }
  return data
}

async function requestFormData(path, { method = 'POST', body, auth = false } = {}) {
  if (shouldRequireExplicitApiBase()) {
    throw createMissingApiError()
  }

  const headers = {}
  if (auth) {
    const token = readSession()?.token
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
      signal: controller?.signal,
    })
  } catch (error) {
    const isTimeout = String(error?.name ?? '') === 'AbortError'
    const nextError = new Error(
      isTimeout
        ? `${API_DISPLAY_NAME} 連線逾時：${requestUrl}`
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
    throw new Error(`${API_DISPLAY_NAME} 回應格式錯誤`)
  }
  return data
}

function persistAuthResponse(data) {
  return writeSession(buildAuthResponseSession(data, readSession()))
}

function updateSessionUser(user) {
  const session = readSession()
  if (!session?.token || !user) return null
  return writeSession({
    token: session.token,
    refreshToken: String(session.refreshToken ?? '').trim(),
    user: normalizeSessionUser(user, session.user),
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

export function isSharedLedgerAuthenticated() {
  return Boolean(readSession()?.token)
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
  })
  return persistAuthResponse(data)
}

export async function loginSharedLedgerAccount(payload = {}) {
  const data = await requestJson('/api/auth/login', {
    method: 'POST',
    body: payload,
    auth: false,
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
  })
  return persistAuthResponse(data)
}

export async function changeSharedLedgerPassword(payload = {}) {
  const data = await requestJson('/api/auth/password/change', {
    method: 'POST',
    body: payload,
  })
  return persistAuthResponse(data)
}

export async function refreshSharedLedgerSession() {
  const session = readSession()
  if (!session?.token) return null
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
  if (!session?.token) return null

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
        if (session.refreshToken) {
          return await performRefreshRequest()
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
    if (session?.token) {
      await requestJson('/api/auth/logout', {
        method: 'POST',
        body: {
          refreshToken: session.refreshToken ?? '',
        },
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
  url.searchParams.set('inviteCode', normalizedInviteCode)
  return url.toString()
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
    throw new Error('共享連結無效，請重新取得邀請連結')
  }
  return requestJson('/api/shared-ledgers/join', {
    method: 'POST',
    body: { inviteCode: normalizedInviteCode },
  })
}

export async function getSharedLedgerSnapshot(sharedLedgerId) {
  const normalizedId = String(sharedLedgerId ?? '').trim()
  if (!normalizedId) throw new Error('缺少共同帳本 ID')
  return requestJson(`/api/shared-ledgers/${normalizedId}/snapshot`)
}

export async function getSharedLedgerDetail(sharedLedgerId) {
  const normalizedId = String(sharedLedgerId ?? '').trim()
  if (!normalizedId) throw new Error('缺少共同帳本 ID')
  return requestJson(`/api/shared-ledgers/${normalizedId}`)
}

export async function pushSharedLedgerSnapshot(sharedLedgerId, payload = {}) {
  const normalizedId = String(sharedLedgerId ?? '').trim()
  if (!normalizedId) throw new Error('缺少共同帳本 ID')
  return requestJson(`/api/shared-ledgers/${normalizedId}/snapshot`, {
    method: 'POST',
    body: payload,
  })
}

export async function deleteSharedLedger(sharedLedgerId) {
  const normalizedId = String(sharedLedgerId ?? '').trim()
  if (!normalizedId) throw new Error('缺少共同帳本 ID')
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

export async function listPendingSharedLedgerInvitations() {
  return requestJson('/api/shared-ledgers/invitations/pending')
}

export async function acceptSharedLedgerInvitation(invitationId) {
  const normalizedId = String(invitationId ?? '').trim()
  if (!normalizedId) throw new Error('缺少共同帳本邀請 ID')
  return requestJson(`/api/shared-ledgers/invitations/${normalizedId}`, {
    method: 'POST',
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
