import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const sqliteSource = readFileSync(new URL('../src/core/db/sqlite.js', import.meta.url), 'utf8')

test('web sqlite mutations persist to the browser store before emitting mutation events', () => {
  assert.match(sqliteSource, /async function persistWebStoreAfterMutation\(\)/)
  assert.match(sqliteSource, /Capacitor\.getPlatform\(\) !== 'web'/)
  assert.match(sqliteSource, /await sqlite\.saveToStore\(activeDbName\)/)
  // Outside a transaction: persist + emit immediately.
  // Inside withTransaction: defer persist until successful commit (smb300 atomic).
  assert.match(sqliteSource, /pendingTransactionMutation/)
  assert.match(
    sqliteSource,
    /if \(joinOuter\) \{\s*pendingTransactionMutation = true\s*\} else \{\s*await persistWebStoreAfterMutation\(\)\s*emitDataMutationEvent\(\)/,
  )
  assert.match(
    sqliteSource,
    /await conn\.commitTransaction\(\)[\s\S]*if \(pendingTransactionMutation\) \{\s*await persistWebStoreAfterMutation\(\)\s*emitDataMutationEvent\(\)/,
  )
})
