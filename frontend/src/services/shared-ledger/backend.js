import { Capacitor } from '@capacitor/core'

const DEV_DEFAULT_SHARED_LEDGER_API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:8787' : ''
const SHARED_LEDGER_API_BASE = String(import.meta.env.VITE_SHARED_LEDGER_API_BASE_URL ?? DEV_DEFAULT_SHARED_LEDGER_API_BASE).trim()
const SESSION_STORAGE_KEY = 'straw.shared_ledger_session'
const sessionListeners = new Set()

function buildApiUrl(path) {
  const normalizedPath = String(path ?? '').trim()
  if (!normalizedPath.startsWith('/')) {
    throw new Error(`invalid shared ledger api path: ${normalizedPath}`)
  }
  if (!SHARED_LEDGER_API_BASE) return normalizedPath
  return `${SHARED_LEDGER_API_BASE.replace(/\/$/, '')}${normalizedPath}`
}

function shouldRequireExplicitApiBase() {
  if (SHARED_LEDGER_API_BASE) return false
  return Capacitor.getPlatform() !== 'web'
}

function createMissingApiError() {
  const platform = Capacitor.getPlatform()
  const message = platform === 'web'
    ? '共同帳本 API 未設定，請啟動 backend Node.js 伺服器，或設定 VITE_SHARED_LEDGER_API_BASE_URL'
    : '手機 App 需設定共同帳本 API URL，請先部署後端並設定 VITE_SHARED_LEDGER_API_BASE_URL'
  const error = new Error(message)
  error.code = 'shared_ledger_api_unavailable'
  return error
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

function writeSession(session) {
  if (typeof localStorage === 'undefined') return null
  if (!session?.token || !session?.user) {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    notifySessionListeners(null)
    return null
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  notifySessionListeners(session)
  return session
}

function clearSession() {
  if (typeof localStorage === 'undefined') return
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

async function requestJson(path, { method = 'GET', body, auth = true } = {}) {
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

  const response = await fetch(buildApiUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

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
    if (response.status === 401 && auth) {
      clearSession()
    }
    const error = new Error(String(data?.message ?? data?.error ?? text ?? `HTTP ${response.status}`))
    error.code = String(data?.error ?? '')
    error.status = response.status
    error.currentVersion = Number(data?.current_version ?? 0)
    throw error
  }

  if (!data || typeof data !== 'object') {
    throw new Error('共同帳本後端回應格式錯誤')
  }
  return data
}

function persistAuthResponse(data) {
  if (!data?.token || !data?.user) {
    throw new Error('共同帳本登入回應格式錯誤')
  }
  return writeSession({
    token: data.token,
    user: data.user,
  })
}

function updateSessionUser(user) {
  const session = readSession()
  if (!session?.token || !user) return null
  return writeSession({
    token: session.token,
    user,
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

export async function refreshSharedLedgerSession() {
  const session = readSession()
  if (!session?.token) return null
  const data = await requestJson('/api/auth/me')
  return updateSessionUser(data.user)
}

export async function logoutSharedLedgerAccount() {
  try {
    if (readSession()?.token) {
      await requestJson('/api/auth/logout', {
        method: 'POST',
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

export async function createSharedLedger(payload = {}) {
  return requestJson('/api/shared-ledgers', {
    method: 'POST',
    body: payload,
  })
}

export async function joinSharedLedger(inviteCode) {
  return requestJson('/api/shared-ledgers/join', {
    method: 'POST',
    body: { inviteCode },
  })
}

export async function getSharedLedgerSnapshot(sharedLedgerId) {
  const normalizedId = String(sharedLedgerId ?? '').trim()
  if (!normalizedId) throw new Error('缺少共同帳本 ID')
  return requestJson(`/api/shared-ledgers/${normalizedId}/snapshot`)
}

export async function pushSharedLedgerSnapshot(sharedLedgerId, payload = {}) {
  const normalizedId = String(sharedLedgerId ?? '').trim()
  if (!normalizedId) throw new Error('缺少共同帳本 ID')
  return requestJson(`/api/shared-ledgers/${normalizedId}/snapshot`, {
    method: 'POST',
    body: payload,
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

export async function createSharedLedgerEmailInvitation(sharedLedgerId, email) {
  const normalizedId = String(sharedLedgerId ?? '').trim()
  if (!normalizedId) throw new Error('缺少共同帳本 ID')
  return requestJson(`/api/shared-ledgers/${normalizedId}/invitations`, {
    method: 'POST',
    body: { email },
  })
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
