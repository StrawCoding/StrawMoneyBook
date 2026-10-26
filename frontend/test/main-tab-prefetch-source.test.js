import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const ledgerRuntimeSource = readFileSync(resolve(root, 'src/ui/services/ledger-runtime.service.js'), 'utf8')
const prefetchSource = readFileSync(resolve(root, 'src/ui/services/main-tab-prefetch.service.js'), 'utf8')
const analysisCacheSource = readFileSync(resolve(root, 'src/ui/stores/analysis-cache.store.js'), 'utf8')
const analysisViewSource = readFileSync(resolve(root, 'src/ui/views/analysis.vue'), 'utf8')
const homeFilterSource = readFileSync(resolve(root, 'src/ui/composables/useHomePeriodFilter.js'), 'utf8')

test('ledger bootstrap prefetches main tab data before deferred hydration', () => {
  assert.match(ledgerRuntimeSource, /prefetchMainTabData/)
  assert.match(ledgerRuntimeSource, /await prefetchMainTabData\(pinia, normalizedLedgerId\)/)
  assert.match(prefetchSource, /loadHomeMonth/)
  assert.match(prefetchSource, /loadAnalysisStats/)
  assert.match(analysisCacheSource, /useAnalysisCacheStore/)
  assert.match(analysisViewSource, /analysisCacheStore/)
  assert.match(homeFilterSource, /homeRecent\.length > 0/)
})
