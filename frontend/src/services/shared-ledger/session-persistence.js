export const SHARED_LEDGER_SESSION_STORAGE_KEY = 'straw.shared_ledger_session'

function parseStoredSession(rawValue) {
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

export function readPersistedSharedLedgerSession({
  storageKey = SHARED_LEDGER_SESSION_STORAGE_KEY,
  localStorageRef = globalThis.localStorage,
  sessionStorageRef = globalThis.sessionStorage,
} = {}) {
  if (localStorageRef) {
    const localSession = parseStoredSession(localStorageRef.getItem(storageKey))
    if (localSession) {
      return localSession
    }
  }

  if (!sessionStorageRef) return null

  const legacySession = parseStoredSession(sessionStorageRef.getItem(storageKey))
  if (!legacySession) return null

  if (localStorageRef) {
    localStorageRef.setItem(storageKey, JSON.stringify(legacySession))
  }
  sessionStorageRef.removeItem(storageKey)
  return legacySession
}
