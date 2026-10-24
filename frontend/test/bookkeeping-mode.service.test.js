import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AI_BOOKKEEPING_PATH,
  QUICK_ADD_BOOKKEEPING_PATH,
  QNA_BOOKKEEPING_PATH,
  getPreferredBookkeepingPath,
  getLastManualBookkeepingPath,
  rememberBookkeepingPath,
  normalizeBookkeepingPath,
} from '../src/ui/services/bookkeeping-mode.service.js'

function mockStorage() {
  const data = new Map()
  globalThis.localStorage = {
    getItem(key) {
      return data.has(key) ? data.get(key) : null
    },
    setItem(key, value) {
      data.set(key, String(value))
    },
  }
  return data
}

test('bookkeeping mode defaults to quick-add', () => {
  mockStorage()
  assert.equal(getPreferredBookkeepingPath(), QUICK_ADD_BOOKKEEPING_PATH)
  assert.equal(getLastManualBookkeepingPath(), QUICK_ADD_BOOKKEEPING_PATH)
})

test('remembering AI does not overwrite last manual path', () => {
  mockStorage()
  rememberBookkeepingPath(QNA_BOOKKEEPING_PATH)
  rememberBookkeepingPath(AI_BOOKKEEPING_PATH)
  assert.equal(getPreferredBookkeepingPath(), AI_BOOKKEEPING_PATH)
  assert.equal(getLastManualBookkeepingPath(), QNA_BOOKKEEPING_PATH)
})

test('normalize rejects unknown paths', () => {
  assert.equal(normalizeBookkeepingPath('/nope'), QUICK_ADD_BOOKKEEPING_PATH)
  assert.equal(normalizeBookkeepingPath(AI_BOOKKEEPING_PATH), AI_BOOKKEEPING_PATH)
})
