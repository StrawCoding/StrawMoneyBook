const LAST_MANUAL_BOOKKEEPING_PATH_KEY = 'straw.bookkeeping.last_manual_path'

export const QUICK_ADD_BOOKKEEPING_PATH = '/transactions/quick-add'
export const QNA_BOOKKEEPING_PATH = '/transactions/qna'

function getStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch (error) {
    return null
  }
}

export function isManualBookkeepingPath(path) {
  return path === QUICK_ADD_BOOKKEEPING_PATH || path === QNA_BOOKKEEPING_PATH
}

export function normalizeManualBookkeepingPath(path) {
  return path === QNA_BOOKKEEPING_PATH
    ? QNA_BOOKKEEPING_PATH
    : QUICK_ADD_BOOKKEEPING_PATH
}

export function getLastManualBookkeepingPath() {
  const storage = getStorage()
  if (!storage) return QUICK_ADD_BOOKKEEPING_PATH
  try {
    return normalizeManualBookkeepingPath(storage.getItem(LAST_MANUAL_BOOKKEEPING_PATH_KEY))
  } catch (error) {
    return QUICK_ADD_BOOKKEEPING_PATH
  }
}

export function rememberManualBookkeepingPath(path) {
  const normalizedPath = normalizeManualBookkeepingPath(path)
  const storage = getStorage()
  if (!storage) return normalizedPath
  try {
    storage.setItem(LAST_MANUAL_BOOKKEEPING_PATH_KEY, normalizedPath)
  } catch (error) {
    // Ignore storage failures and keep the in-memory fallback path.
  }
  return normalizedPath
}
