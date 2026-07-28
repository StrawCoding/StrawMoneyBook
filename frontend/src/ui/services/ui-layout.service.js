const STORAGE_KEY = 'strawmoneybook.ui.layout'
const DEFAULT_LAYOUT = 'modern'

const UI_LAYOUTS = {
  modern: {
    id: 'modern',
    nameKey: 'ui_layout.modern.name',
    descriptionKey: 'ui_layout.modern.description',
  },
}

function getStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * App ships modern-only (Apple HIG). Legacy `traditional` preference migrates to modern.
 */
export function normalizeUiLayout(_value) {
  return DEFAULT_LAYOUT
}

export function listUiLayouts() {
  return Object.values(UI_LAYOUTS)
}

function migrateStoredLayout(storage) {
  if (!storage) return
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw == null) return
    const normalized = String(raw).trim().toLowerCase()
    if (normalized !== DEFAULT_LAYOUT) {
      storage.setItem(STORAGE_KEY, DEFAULT_LAYOUT)
    }
  } catch {
    // Ignore storage failures; in-memory layout still applies for this session.
  }
}

export function getCurrentUiLayout() {
  const storage = getStorage()
  if (!storage) return DEFAULT_LAYOUT
  try {
    migrateStoredLayout(storage)
    return DEFAULT_LAYOUT
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function applyUiLayout(_layoutId) {
  const layout = DEFAULT_LAYOUT
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.uiLayout = layout
  }
  return layout
}

export function saveUiLayout(_layoutId) {
  const layout = applyUiLayout(DEFAULT_LAYOUT)
  const storage = getStorage()
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, layout)
    } catch {
      // Ignore storage failures; in-memory layout still applies for this session.
    }
  }
  return layout
}

export function loadUiLayout() {
  return applyUiLayout(getCurrentUiLayout())
}

export function isModernUiLayout(_layoutId = getCurrentUiLayout()) {
  return true
}
