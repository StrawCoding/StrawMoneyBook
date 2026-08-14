import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  APP_DOWNGRADE_BLOCKED_CODE,
  assertNoDataDowngrade,
  compareAppVersions,
  evaluateDataDowngradeRisk,
  writeLocalDataFloorPrefs,
  readLocalDataFloorPrefs,
  clearLocalDataFloorPrefs,
} from '../src/core/services/data-downgrade-guard.service.js'

const root = resolve(import.meta.dirname, '..')

test('compareAppVersions orders semver-like strings', () => {
  assert.equal(compareAppVersions('1.3.129', '1.3.128'), 1)
  assert.equal(compareAppVersions('1.3.100', '1.3.129'), -1)
  assert.equal(compareAppVersions('v1.3.129', '1.3.129'), 0)
})

test('schema ahead of binary is blocked', () => {
  const risk = evaluateDataDowngradeRisk({
    knownSchemaMax: 45,
    dbMaxSchemaVersion: 50,
    currentAppVersion: '1.3.129',
  })
  assert.equal(risk?.reason, 'schema_ahead')
  assert.throws(
    () => assertNoDataDowngrade({
      knownSchemaMax: 45,
      dbMaxSchemaVersion: 50,
      currentAppVersion: '1.3.129',
    }),
    (error) => error?.code === APP_DOWNGRADE_BLOCKED_CODE,
  )
})

test('older app vs data floor app version is blocked', () => {
  const risk = evaluateDataDowngradeRisk({
    knownSchemaMax: 45,
    dbMaxSchemaVersion: 45,
    floorAppVersion: '1.3.129',
    currentAppVersion: '1.3.100',
  })
  assert.equal(risk?.reason, 'app_version_ahead')
})

test('same or newer app against floor is allowed', () => {
  assert.equal(
    evaluateDataDowngradeRisk({
      knownSchemaMax: 45,
      dbMaxSchemaVersion: 45,
      floorAppVersion: '1.3.129',
      currentAppVersion: '1.3.129',
    }),
    null,
  )
  assert.equal(
    evaluateDataDowngradeRisk({
      knownSchemaMax: 45,
      dbMaxSchemaVersion: 45,
      floorAppVersion: '1.3.129',
      currentAppVersion: '1.3.130',
    }),
    null,
  )
})

test('prefs floor also blocks older app', () => {
  const risk = evaluateDataDowngradeRisk({
    knownSchemaMax: 45,
    dbMaxSchemaVersion: 40,
    prefsAppVersion: '1.3.200',
    currentAppVersion: '1.3.100',
  })
  assert.equal(risk?.reason, 'app_version_ahead')
  assert.equal(risk.floorAppVersion, '1.3.200')
})

test('localStorage floor merge keeps the higher watermark', () => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: (key) => { store.delete(key) },
  }
  clearLocalDataFloorPrefs()
  writeLocalDataFloorPrefs({ appVersion: '1.3.100', schemaVersion: 40 })
  writeLocalDataFloorPrefs({ appVersion: '1.3.50', schemaVersion: 45 })
  const floor = readLocalDataFloorPrefs()
  assert.equal(floor.appVersion, '1.3.100')
  assert.equal(floor.schemaVersion, 45)
  clearLocalDataFloorPrefs()
})

test('migrate wires downgrade guard before applying migrations', () => {
  const migrateSource = readFileSync(resolve(root, 'src/core/db/migrate.js'), 'utf8')
  assert.match(migrateSource, /enforceDataDowngradeGuard/)
  assert.match(migrateSource, /stampDataFloor/)
  assert.match(migrateSource, /getKnownMaxSchemaVersion/)
  assert.match(migrateSource, /data-downgrade-guard\.service/)
  const sqliteSource = readFileSync(resolve(root, 'src/core/db/sqlite.js'), 'utf8')
  assert.match(sqliteSource, /clearLocalDataFloorPrefs/)
  const bootstrapSource = readFileSync(resolve(root, 'src/core/services/bootstrap.service.js'), 'utf8')
  assert.match(bootstrapSource, /APP_DOWNGRADE_BLOCKED_CODE/)
})
