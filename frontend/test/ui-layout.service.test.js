import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyUiLayout,
  getCurrentUiLayout,
  isModernUiLayout,
  listUiLayouts,
  loadUiLayout,
  normalizeUiLayout,
  saveUiLayout,
} from '../src/ui/services/ui-layout.service.js'

const STORAGE_KEY = 'strawmoneybook.ui.layout'

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
  }
}

test('ui-layout.service defaults to modern and normalizes legacy values', () => {
  assert.deepEqual(listUiLayouts().map((item) => item.id), ['traditional', 'modern'])
  assert.equal(normalizeUiLayout(''), 'modern')
  assert.equal(normalizeUiLayout('traditional'), 'traditional')
  assert.equal(normalizeUiLayout('unexpected'), 'modern')
})

test('ui-layout.service persists preference in localStorage', () => {
  const localStorageRef = createStorage()
  const originalLocalStorage = globalThis.localStorage
  globalThis.localStorage = localStorageRef

  try {
    saveUiLayout('traditional')
    assert.equal(getCurrentUiLayout(), 'traditional')
    assert.equal(isModernUiLayout(), false)

    saveUiLayout('modern')
    assert.equal(getCurrentUiLayout(), 'modern')
    assert.equal(isModernUiLayout(), true)
    assert.equal(localStorageRef.getItem(STORAGE_KEY), 'modern')

    const applied = loadUiLayout()
    assert.equal(applied, 'modern')
    if (typeof document !== 'undefined') {
      assert.equal(document.documentElement.dataset.uiLayout, 'modern')
    }
  } finally {
    globalThis.localStorage = originalLocalStorage
    applyUiLayout('modern')
  }
})
