import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/AiAutoBookkeepingPage.vue'),
  'utf8',
)

test('AI bookkeeping saves now route through close-after-success flow', () => {
  assert.match(source, /@click="saveDraftAndReturn"/)
  assert.match(source, /async function closePage\(\)/)
  assert.match(source, /await submit\(\{ closeAfterSuccess: true \}\)/)
  assert.match(source, /if \(successCount > 0\) \{\s*await closePage\(\)/)
  assert.match(source, /if \(closeAfterSuccess\) \{\s*await closePage\(\)/)
})

test('AI submit maps shared bookkeeping errors and keeps created transaction id', () => {
  assert.match(source, /resolveBookkeepingSubmitErrorMessage/)
  assert.match(source, /isUnsetZeroBookkeepingAmount/)
  assert.match(source, /const savedTxId = String\(persistedTransactionId\.value/)
  assert.match(source, /return savedTxId \|\| true/)
  assert.match(source, /typeof created === 'string'/)
  assert.match(source, /data-testid="ai-bookkeeping-save"/)
  assert.match(source, /data-testid="ai-bookkeeping-parse"/)
})
