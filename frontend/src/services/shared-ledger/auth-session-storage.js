import { Capacitor } from '@capacitor/core'

export const SHARED_LEDGER_SESSION_STORAGE_KEY = 'straw.shared_ledger_session'
export const AUTH_STORAGE_HEADER = 'X-Straw-Auth-Storage'
export const AUTH_STORAGE_COOKIE_MODE = 'cookie'
export const SHARED_LEDGER_USER_STORAGE_KEY = 'straw.shared_ledger_user.v2'

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
  return {
    [AUTH_STORAGE_HEADER]: AUTH_STORAGE_COOKIE_MODE,
  }
}

export function shouldSendAuthCredentials() {
  return usesCookieAuthStorage()
}

export function getStoredAccessToken() {
  return memoryAccessToken
}

export function getStoredRefreshToken() {
  return memoryRefreshToken
}

export function setStoredAccessToken(token) {
  memoryAccessToken = String(token ?? '').trim()
}

export function setStoredRefreshToken(token) {
  memoryRefreshToken = String(token ?? '').trim()
}

export function clearStoredTokens() {
  memoryAccessToken = ''
  memoryRefreshToken = ''
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
  if (!session?.token || !session?.user) {
    clearPersistedAuthSession()
    return null
  }

  setStoredAccessToken(session.token)
  if (!usesCookieAuthStorage()) {
    setStoredRefreshToken(session.refreshToken ?? '')
  } else {
    setStoredRefreshToken('')
  }
  writeStoredUser(session.user)

  return {
    token: getStoredAccessToken(),
    refreshToken: getStoredRefreshToken(),
    user: readStoredUser(),
  }
}

export function clearPersistedAuthSession() {
  clearStoredTokens()
  clearStoredUser()

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
