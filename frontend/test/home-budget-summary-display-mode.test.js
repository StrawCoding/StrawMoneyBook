import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_MODE,
  STORAGE_KEY,
  getHomeBudgetSummaryDisplayMode,
  normalizeHomeBudgetSummaryDisplayMode,
  setHomeBudgetSummaryDisplayMode,
} from '../src/ui/services/home-budget-summary-display-mode.service.js'

test('normalizeHomeBudgetSummaryDisplayMode accepts daily only', () => {
  assert.equal(normalizeHomeBudgetSummaryDisplayMode('daily'), 'daily')
  assert.equal(normalizeHomeBudgetSummaryDisplayMode('monthly'), 'monthly')
  assert.equal(normalizeHomeBudgetSummaryDisplayMode(''), DEFAULT_MODE)
  assert.equal(normalizeHomeBudgetSummaryDisplayMode('invalid'), DEFAULT_MODE)
})

test('display mode persists in localStorage', () => {
  const storage = {
    data: {},
    getItem(key) {
      return this.data[key] ?? null
    },
    setItem(key, value) {
      this.data[key] = String(value)
    },
    removeItem(key) {
      delete this.data[key]
    },
  }
  const previous = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  try {
    storage.removeItem(STORAGE_KEY)
    assert.equal(getHomeBudgetSummaryDisplayMode(), DEFAULT_MODE)
    setHomeBudgetSummaryDisplayMode('daily')
    assert.equal(storage.getItem(STORAGE_KEY), 'daily')
    assert.equal(getHomeBudgetSummaryDisplayMode(), 'daily')
    setHomeBudgetSummaryDisplayMode('monthly')
    assert.equal(getHomeBudgetSummaryDisplayMode(), 'monthly')
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: previous, configurable: true })
  }
})

test('composable wires persistence for setDisplayMode', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../src/ui/composables/useHomeBudgetSummaryMetrics.js', import.meta.url)),
    'utf8',
  )
  assert.match(source, /sharedDisplayMode/)
  assert.match(source, /setHomeBudgetSummaryDisplayMode/)
})
