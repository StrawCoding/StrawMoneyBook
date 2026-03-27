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
