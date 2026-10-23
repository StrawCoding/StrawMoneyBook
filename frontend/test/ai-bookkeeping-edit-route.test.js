import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(import.meta.dirname, '../src/ui/views/AiAutoBookkeepingPage.vue'),
  'utf8',
)

test('AI bookkeeping success returns home instead of opening the transaction editor', () => {
  assert.match(source, /returnHomeAfterBookkeeping\(router\)/)
  assert.match(source, /closeAfterSuccess: true/)
  assert.doesNotMatch(source, /name:\s*'transaction-edit'/)
  assert.doesNotMatch(source, /from:\s*'ai-auto-bookkeeping'/)
})
