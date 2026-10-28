const STORAGE_KEY = 'strawmoneybook.analysis.account_analysis_type'
const DEFAULT_TYPE = 'expense'

function getStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function normalizeAnalysisAccountAnalysisType(value) {
  const raw = String(value ?? '').trim()
  if (raw === 'total' || raw === 'income' || raw === 'expense') return raw
  return DEFAULT_TYPE
}

export function getAnalysisAccountAnalysisType() {
  const storage = getStorage()
  if (!storage) return DEFAULT_TYPE
  try {
    return normalizeAnalysisAccountAnalysisType(storage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_TYPE
  }
}

export function setAnalysisAccountAnalysisType(type) {
  const normalized = normalizeAnalysisAccountAnalysisType(type)
  const storage = getStorage()
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, normalized)
    } catch {
      // ignore quota / private mode
    }
  }
  return normalized
}

export { STORAGE_KEY, DEFAULT_TYPE }
