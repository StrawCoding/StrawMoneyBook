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

test('ui-layout.service is modern-only and migrates legacy traditional', () => {
  assert.deepEqual(listUiLayouts().map((item) => item.id), ['modern'])
  assert.equal(normalizeUiLayout(''), 'modern')
  assert.equal(normalizeUiLayout('traditional'), 'modern')
  assert.equal(normalizeUiLayout('unexpected'), 'modern')
  assert.equal(isModernUiLayout('traditional'), true)
})

test('ui-layout.service migrates stored traditional preference to modern', () => {
  const localStorageRef = createStorage({ [STORAGE_KEY]: 'traditional' })
  const originalLocalStorage = globalThis.localStorage
  globalThis.localStorage = localStorageRef

  try {
    assert.equal(getCurrentUiLayout(), 'modern')
    assert.equal(localStorageRef.getItem(STORAGE_KEY), 'modern')

    saveUiLayout('traditional')
    assert.equal(getCurrentUiLayout(), 'modern')
    assert.equal(isModernUiLayout(), true)
    assert.equal(localStorageRef.getItem(STORAGE_KEY), 'modern')

    const applied = loadUiLayout()
    assert.equal(applied, 'modern')
    if (typeof document !== 'undefined') {
      assert.equal(document.documentElement.dataset.uiLayout, 'modern')
    }

    applyUiLayout('traditional')
    if (typeof document !== 'undefined') {
      assert.equal(document.documentElement.dataset.uiLayout, 'modern')
    }
  } finally {
    globalThis.localStorage = originalLocalStorage
    applyUiLayout('modern')
  }
})
