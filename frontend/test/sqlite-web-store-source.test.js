import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const sqliteSource = readFileSync(new URL('../src/core/db/sqlite.js', import.meta.url), 'utf8')

test('web sqlite mutations persist to the browser store before emitting mutation events', () => {
  assert.match(sqliteSource, /async function persistWebStoreAfterMutation\(\)/)
  assert.match(sqliteSource, /Capacitor\.getPlatform\(\) !== 'web'/)
  assert.match(sqliteSource, /await sqlite\.saveToStore\(activeDbName\)/)
  assert.match(
    sqliteSource,
    /if \(isDataMutationSql\(sql\)\) \{\s*await persistWebStoreAfterMutation\(\)\s*emitDataMutationEvent\(\)/,
  )
})
