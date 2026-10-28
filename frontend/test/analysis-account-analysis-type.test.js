import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_TYPE,
  STORAGE_KEY,
  getAnalysisAccountAnalysisType,
  normalizeAnalysisAccountAnalysisType,
  setAnalysisAccountAnalysisType,
} from '../src/ui/services/analysis-account-analysis-type.service.js'

test('normalizeAnalysisAccountAnalysisType accepts total, income, expense', () => {
  assert.equal(normalizeAnalysisAccountAnalysisType('total'), 'total')
  assert.equal(normalizeAnalysisAccountAnalysisType('income'), 'income')
  assert.equal(normalizeAnalysisAccountAnalysisType('expense'), 'expense')
  assert.equal(normalizeAnalysisAccountAnalysisType(''), DEFAULT_TYPE)
  assert.equal(normalizeAnalysisAccountAnalysisType('invalid'), DEFAULT_TYPE)
})

test('account analysis type persists in localStorage', () => {
  const storage = {
    data: {},
    getItem(key) {
      return this.data[key] ?? null
    },
    setItem(key, value) {
      this.data[key] = String(value)
    },
  }
  const previous = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  try {
    storage.data = {}
    assert.equal(getAnalysisAccountAnalysisType(), DEFAULT_TYPE)
    setAnalysisAccountAnalysisType('total')
    assert.equal(storage.getItem(STORAGE_KEY), 'total')
    assert.equal(getAnalysisAccountAnalysisType(), 'total')
    setAnalysisAccountAnalysisType('income')
    assert.equal(getAnalysisAccountAnalysisType(), 'income')
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: previous, configurable: true })
  }
})

test('analysis page wires account type persistence', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../src/ui/views/analysis.vue', import.meta.url)),
    'utf8',
  )
  assert.match(source, /setAnalysisAccountAnalysisType/)
  assert.match(source, /getAnalysisAccountAnalysisType/)
})
