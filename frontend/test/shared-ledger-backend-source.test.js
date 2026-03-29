import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sharedLedgerBackendSource = readFileSync(
  resolve(import.meta.dirname, '../src/services/shared-ledger/backend.js'),
  'utf8',
)

test('shared ledger session restore reuses the shared refresh pipeline', () => {
  assert.match(
    sharedLedgerBackendSource,
    /if \(session\.refreshToken\) \{\s+\/\/ Reuse the shared refresh pipeline[\s\S]*?return await tryRefreshSessionOnce\(\)/,
  )
  assert.doesNotMatch(
    sharedLedgerBackendSource,
    /if \(session\.refreshToken\) \{\s+return await performRefreshRequest\(\)/,
  )
})
