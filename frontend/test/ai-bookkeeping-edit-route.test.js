import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/AiAutoBookkeepingPage.vue'),
  'utf8',
)

test('AI bookkeeping single-item auto create routes to standalone transaction edit page', () => {
  assert.match(source, /const savedTxId = String\(persistedTransactionId\.value \?\? ''\)\.trim\(\)/)
  assert.match(source, /await router\.push\(\{\s+name: 'transaction-edit',\s+params: \{ id: savedTxId \},/s)
  assert.match(source, /query: \{ from: 'ai-auto-bookkeeping' \}/)
})
