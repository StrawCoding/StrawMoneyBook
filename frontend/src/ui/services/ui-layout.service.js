const STORAGE_KEY = 'strawmoneybook.ui.layout'
const DEFAULT_LAYOUT = 'modern'

const UI_LAYOUTS = {
  traditional: {
    id: 'traditional',
    nameKey: 'ui_layout.traditional.name',
    descriptionKey: 'ui_layout.traditional.description',
  },
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

export function normalizeUiLayout(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'traditional' ? 'traditional' : 'modern'
}

export function listUiLayouts() {
  return Object.values(UI_LAYOUTS)
}

export function getCurrentUiLayout() {
  const storage = getStorage()
  if (!storage) return DEFAULT_LAYOUT
  try {
    return normalizeUiLayout(storage.getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function applyUiLayout(layoutId) {
  const layout = normalizeUiLayout(layoutId)
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.uiLayout = layout
  }
  return layout
}

export function saveUiLayout(layoutId) {
  const layout = applyUiLayout(layoutId)
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

export function isModernUiLayout(layoutId = getCurrentUiLayout()) {
  return normalizeUiLayout(layoutId) === 'modern'
}
