import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyUiLayout,
  getCurrentUiLayout,
  isModernUiLayout,
  isTraditionalUiLayout,
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

test('ui-layout.service keeps traditional and modern as selectable layouts', () => {
  assert.deepEqual(listUiLayouts().map((item) => item.id), ['traditional', 'modern'])
  assert.equal(normalizeUiLayout(''), 'modern')
  assert.equal(normalizeUiLayout('traditional'), 'traditional')
  assert.equal(normalizeUiLayout('modern'), 'modern')
  assert.equal(normalizeUiLayout('unexpected'), 'modern')
  assert.equal(isModernUiLayout('traditional'), false)
  assert.equal(isTraditionalUiLayout('traditional'), true)
  assert.equal(isModernUiLayout('modern'), true)
})

test('ui-layout.service persists traditional without migrating to modern', () => {
  const localStorageRef = createStorage({ [STORAGE_KEY]: 'traditional' })
  const originalLocalStorage = globalThis.localStorage
  globalThis.localStorage = localStorageRef

  try {
    assert.equal(getCurrentUiLayout(), 'traditional')
    assert.equal(localStorageRef.getItem(STORAGE_KEY), 'traditional')

    saveUiLayout('traditional')
    assert.equal(getCurrentUiLayout(), 'traditional')
    assert.equal(isTraditionalUiLayout(), true)
    assert.equal(localStorageRef.getItem(STORAGE_KEY), 'traditional')

    const applied = loadUiLayout()
    assert.equal(applied, 'traditional')
    if (typeof document !== 'undefined') {
      assert.equal(document.documentElement.dataset.uiLayout, 'traditional')
    }

    applyUiLayout('modern')
    if (typeof document !== 'undefined') {
      assert.equal(document.documentElement.dataset.uiLayout, 'modern')
    }
    saveUiLayout('modern')
    assert.equal(getCurrentUiLayout(), 'modern')
  } finally {
    globalThis.localStorage = originalLocalStorage
    applyUiLayout('modern')
  }
})
