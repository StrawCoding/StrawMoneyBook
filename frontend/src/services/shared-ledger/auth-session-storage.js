import { Capacitor } from '@capacitor/core'

export const SHARED_LEDGER_SESSION_STORAGE_KEY = 'straw.shared_ledger_session'
export const AUTH_STORAGE_HEADER = 'X-Straw-Auth-Storage'
export const AUTH_STORAGE_COOKIE_MODE = 'cookie'
export const NATIVE_CLIENT_HEADER = 'X-Straw-Native-Client'
export const SHARED_LEDGER_USER_STORAGE_KEY = 'straw.shared_ledger_user.v2'
export const NATIVE_REFRESH_TOKEN_STORAGE_KEY = 'straw.shared_ledger_native_refresh.v1'
/** Survives process death so cold start does not fake "Session valid" after refresh failure. */
export const SHARED_LEDGER_NEEDS_REAUTH_KEY = 'straw.shared_ledger_needs_reauth.v1'
/**
 * Lightweight localStorage hint that a cookie / native session may still exist.
 * Web profile stays in sessionStorage (XSS surface), but cold start after tab close
 * must still know to attempt silent cookie refresh instead of flashing "logged out".
 */
export const SHARED_LEDGER_AUTH_HINT_KEY = 'straw.shared_ledger_auth_hint.v1'

let memoryAccessToken = ''
let memoryRefreshToken = ''

function getSessionStorageRef() {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

function getLocalStorageRef() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function usesCookieAuthStorage() {
  return true
}

export function getAuthStorageHeaders() {
  if (!usesCookieAuthStorage()) return {}
  const headers = {
    [AUTH_STORAGE_HEADER]: AUTH_STORAGE_COOKIE_MODE,
  }
  const nativeClient = getNativeClientPlatformHeaderValue()
  if (nativeClient) {
    headers[NATIVE_CLIENT_HEADER] = nativeClient
  }
  return headers
}

export function shouldSendAuthCredentials() {
  return usesCookieAuthStorage()
}

export function getStoredAccessToken() {
  return memoryAccessToken
}

export function getStoredRefreshToken() {
  if (memoryRefreshToken) return memoryRefreshToken
  if (!shouldPersistNativeRefreshToken()) return ''
  const localStorageRef = getLocalStorageRef()
  if (!localStorageRef) return ''
  return String(localStorageRef.getItem(NATIVE_REFRESH_TOKEN_STORAGE_KEY) ?? '').trim()
}

/**
 * Cookie auth: HttpOnly cookie owns refresh rotation. Only persist a refresh token
 * when the server explicitly returns one (native backup). Never keep a previous
 * token after a cookie-only refresh — stale native backup + fallback POST triggers reuse.
 */
export function resolveRefreshTokenFromAuthResponse(data, { previousSession = null } = {}) {
  const fromResponse = String(data?.refresh_token ?? data?.refreshToken ?? '').trim()
  if (fromResponse) return fromResponse
  if (shouldSendAuthCredentials()) return ''
  return String(previousSession?.refreshToken ?? getStoredRefreshToken() ?? '').trim()
}

export function setStoredAccessToken(token) {
  memoryAccessToken = String(token ?? '').trim()
}

export function setStoredRefreshToken(token) {
  const normalized = String(token ?? '').trim()
  if (!shouldPersistNativeRefreshToken()) {
    memoryRefreshToken = usesCookieAuthStorage() ? '' : normalized
    const localStorageRef = getLocalStorageRef()
    localStorageRef?.removeItem(NATIVE_REFRESH_TOKEN_STORAGE_KEY)
    return
  }
  memoryRefreshToken = normalized
  const localStorageRef = getLocalStorageRef()
  if (!localStorageRef) return
  if (!normalized) {
    localStorageRef.removeItem(NATIVE_REFRESH_TOKEN_STORAGE_KEY)
    return
  }
  localStorageRef.setItem(NATIVE_REFRESH_TOKEN_STORAGE_KEY, normalized)
}

export function clearStoredTokens() {
  memoryAccessToken = ''
  memoryRefreshToken = ''
  const localStorageRef = getLocalStorageRef()
  localStorageRef?.removeItem(NATIVE_REFRESH_TOKEN_STORAGE_KEY)
}

export function readPersistedNeedsReauthFlag() {
  const localStorageRef = getLocalStorageRef()
  if (!localStorageRef) return false
  return localStorageRef.getItem(SHARED_LEDGER_NEEDS_REAUTH_KEY) === '1'
}

export function writePersistedNeedsReauthFlag(value) {
  const localStorageRef = getLocalStorageRef()
  if (!localStorageRef) return
  if (value) {
    localStorageRef.setItem(SHARED_LEDGER_NEEDS_REAUTH_KEY, '1')
    return
  }
  localStorageRef.removeItem(SHARED_LEDGER_NEEDS_REAUTH_KEY)
}

export function readPersistedAuthHint() {
  const localStorageRef = getLocalStorageRef()
  if (!localStorageRef) return false
  return localStorageRef.getItem(SHARED_LEDGER_AUTH_HINT_KEY) === '1'
}

export function writePersistedAuthHint(value) {
  const localStorageRef = getLocalStorageRef()
  if (!localStorageRef) return
  if (value) {
    localStorageRef.setItem(SHARED_LEDGER_AUTH_HINT_KEY, '1')
    return
  }
  localStorageRef.removeItem(SHARED_LEDGER_AUTH_HINT_KEY)
}

function parseStoredUser(rawValue) {
  if (!rawValue) return null
  try {
    const parsed = JSON.parse(rawValue)
    if (!parsed || typeof parsed !== 'object' || !parsed.id) return null
    return parsed
  } catch {
    return null
  }
}

export function readStoredUser() {
  const sessionStorageRef = getSessionStorageRef()
  if (sessionStorageRef) {
    const user = parseStoredUser(sessionStorageRef.getItem(SHARED_LEDGER_USER_STORAGE_KEY))
    if (user) return user
  }

  const localStorageRef = getLocalStorageRef()
  if (!localStorageRef) return null
  return parseStoredUser(localStorageRef.getItem(SHARED_LEDGER_USER_STORAGE_KEY))
}

export function writeStoredUser(user) {
  const normalizedUser = user && typeof user === 'object' ? user : null
  const sessionStorageRef = getSessionStorageRef()
  const localStorageRef = getLocalStorageRef()

  if (!normalizedUser) {
    sessionStorageRef?.removeItem(SHARED_LEDGER_USER_STORAGE_KEY)
    localStorageRef?.removeItem(SHARED_LEDGER_USER_STORAGE_KEY)
    return null
  }

  const serialized = JSON.stringify(normalizedUser)
  if (shouldPersistUserProfileInLocalStorage()) {
    // Native WebView clears sessionStorage on process death; keep profile in
    // localStorage (tokens stay in memory + HttpOnly cookie only).
    localStorageRef?.setItem(SHARED_LEDGER_USER_STORAGE_KEY, serialized)
    sessionStorageRef?.removeItem(SHARED_LEDGER_USER_STORAGE_KEY)
  } else {
    sessionStorageRef?.setItem(SHARED_LEDGER_USER_STORAGE_KEY, serialized)
    localStorageRef?.removeItem(SHARED_LEDGER_USER_STORAGE_KEY)
  }
  return normalizedUser
}

export function clearStoredUser() {
  writeStoredUser(null)
}

function parseLegacySession(rawValue) {
  if (!rawValue) return null
  try {
    const parsed = JSON.parse(rawValue)
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.token || !parsed.user) return null
    return parsed
  } catch {
    return null
  }
}

export function migrateLegacyPersistedSession({
  storageKey = SHARED_LEDGER_SESSION_STORAGE_KEY,
  localStorageRef = getLocalStorageRef(),
  sessionStorageRef = getSessionStorageRef(),
} = {}) {
  const legacySources = []
  if (localStorageRef) legacySources.push(localStorageRef)
  if (sessionStorageRef) legacySources.push(sessionStorageRef)

  for (const storageRef of legacySources) {
    const legacySession = parseLegacySession(storageRef.getItem(storageKey))
    if (!legacySession) continue

    setStoredAccessToken(legacySession.token)
    if (!usesCookieAuthStorage()) {
      setStoredRefreshToken(legacySession.refreshToken ?? '')
    }
    writeStoredUser(legacySession.user)
    storageRef.removeItem(storageKey)
    return legacySession
  }

  return null
}

export function hasPersistedAuthIdentity() {
  migrateLegacyPersistedSession()
  return Boolean(readStoredUser())
}

/** True when silent restore should be attempted (profile, native refresh, or cookie hint). */
export function hasPersistedAuthRestoreCandidate() {
  migrateLegacyPersistedSession()
  if (readStoredUser()) return true
  if (getStoredRefreshToken()) return true
  return readPersistedAuthHint()
}

export function readPersistedAuthSession() {
  migrateLegacyPersistedSession()

  const user = readStoredUser()
  if (!user) return null

  const token = getStoredAccessToken()
  if (!token && usesCookieAuthStorage()) {
    return {
      token: '',
      refreshToken: '',
      user,
    }
  }
  if (!token) return null

  return {
    token,
    refreshToken: getStoredRefreshToken(),
    user,
  }
}

export function writePersistedAuthSession(session) {
  if (!session?.user) {
    clearPersistedAuthSession()
    return null
  }
  const token = String(session?.token ?? '').trim()
  if (!token && !usesCookieAuthStorage()) {
    clearPersistedAuthSession()
    return null
  }

  setStoredAccessToken(token)
  setStoredRefreshToken(session.refreshToken ?? '')
  writeStoredUser(session.user)
  // Successful auth (or retained identity) marks that cookie/native restore may apply later.
  writePersistedAuthHint(true)

  return {
    token: getStoredAccessToken(),
    refreshToken: getStoredRefreshToken(),
    user: readStoredUser(),
  }
}

export function clearPersistedAuthSession() {
  clearStoredTokens()
  clearStoredUser()
  writePersistedNeedsReauthFlag(false)
  writePersistedAuthHint(false)

  const localStorageRef = getLocalStorageRef()
  const sessionStorageRef = getSessionStorageRef()
  localStorageRef?.removeItem(SHARED_LEDGER_SESSION_STORAGE_KEY)
  sessionStorageRef?.removeItem(SHARED_LEDGER_SESSION_STORAGE_KEY)
}

export function isNativePlatform() {
  const platform = Capacitor.getPlatform()
  return platform === 'android' || platform === 'ios'
}

export function shouldPersistUserProfileInLocalStorage(platform = Capacitor.getPlatform()) {
  const normalized = String(platform ?? '').trim().toLowerCase()
  return normalized === 'android' || normalized === 'ios'
}

export function shouldPersistNativeRefreshToken(platform = Capacitor.getPlatform()) {
  return shouldPersistUserProfileInLocalStorage(platform)
}

export function getNativeClientPlatformHeaderValue(platform = Capacitor.getPlatform()) {
  const normalized = String(platform ?? '').trim().toLowerCase()
  if (normalized === 'android' || normalized === 'ios') return normalized
  return ''
}
