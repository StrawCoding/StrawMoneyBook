import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/AiAutoBookkeepingPage.vue'),
  'utf8',
)

test('AI bookkeeping saves now return home after success', () => {
  assert.match(source, /@click="saveDraftAndReturn"/)
  assert.match(source, /await submit\(\{ closeAfterSuccess: true \}\)/)
  assert.match(source, /if \(successCount > 0\) \{\s*await returnHomeAfterBookkeeping\(router\)/)
  assert.match(source, /if \(closeAfterSuccess\) \{\s*await returnHomeAfterBookkeeping\(router\)/)
  assert.doesNotMatch(source, /await closePage\(\)/)
})

test('AI submit maps shared bookkeeping errors and keeps created transaction id', () => {
  assert.match(source, /resolveBookkeepingSubmitErrorMessage/)
  assert.match(source, /isUnsetZeroBookkeepingAmount/)
  assert.match(source, /const savedTxId = String\(persistedTransactionId\.value/)
  assert.match(source, /return savedTxId \|\| true/)
  assert.match(source, /data-testid="ai-bookkeeping-save"/)
  assert.match(source, /data-testid="ai-bookkeeping-parse"/)
})
