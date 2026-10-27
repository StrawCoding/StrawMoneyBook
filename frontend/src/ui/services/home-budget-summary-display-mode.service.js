const STORAGE_KEY = 'strawmoneybook.home_budget_summary.display_mode'
const DEFAULT_MODE = 'monthly'

function getStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function normalizeHomeBudgetSummaryDisplayMode(value) {
  return String(value ?? '').trim() === 'daily' ? 'daily' : 'monthly'
}

export function getHomeBudgetSummaryDisplayMode() {
  const storage = getStorage()
  if (!storage) return DEFAULT_MODE
  try {
    return normalizeHomeBudgetSummaryDisplayMode(storage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_MODE
  }
}

export function setHomeBudgetSummaryDisplayMode(mode) {
  const normalized = normalizeHomeBudgetSummaryDisplayMode(mode)
  const storage = getStorage()
  if (!storage) return normalized
  try {
    storage.setItem(STORAGE_KEY, normalized)
  } catch {
    // ignore quota / private mode
  }
  return normalized
}

export { STORAGE_KEY, DEFAULT_MODE }
