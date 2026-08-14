/**
 * Fail-safe guard against opening a ledger DB that was written by a newer app.
 * Prevents sideload / cache / adb -d downgrades from silently corrupting data.
 */

import appPackage from '../../../package.json' with { type: 'json' }

export const APP_DOWNGRADE_BLOCKED_CODE = 'APP_DOWNGRADE_BLOCKED'

export const DATA_FLOOR_APP_VERSION_META_KEY = 'data_floor_app_version'
export const DATA_FLOOR_SCHEMA_VERSION_META_KEY = 'data_floor_schema_version'

const PREFS_FLOOR_KEY = 'straw.data_floor.v1'

export function getBundledAppVersion() {
  return String(appPackage?.version ?? '').trim()
}

export function parseVersionParts(versionText) {
  const groups = String(versionText ?? '')
    .trim()
    .replace(/^v/i, '')
    .match(/\d+/g)
  if (!groups?.length) return []
  return groups
    .map((part) => Number.parseInt(String(part), 10))
    .map((part) => (Number.isFinite(part) ? Math.max(0, part) : 0))
}

export function compareAppVersions(leftVersion, rightVersion) {
  const left = parseVersionParts(leftVersion)
  const right = parseVersionParts(rightVersion)
  const length = Math.max(left.length, right.length, 3)
  for (let index = 0; index < length; index += 1) {
    const l = Number(left[index] ?? 0)
    const r = Number(right[index] ?? 0)
    if (l > r) return 1
    if (l < r) return -1
  }
  return 0
}

export function createAppDowngradeBlockedError(details = {}) {
  const reason = String(details.reason ?? 'unknown').trim() || 'unknown'
  const floorAppVersion = String(details.floorAppVersion ?? '').trim()
  const currentAppVersion = String(details.currentAppVersion ?? '').trim()
  const floorSchemaVersion = Number(details.floorSchemaVersion ?? 0)
  const knownSchemaMax = Number(details.knownSchemaMax ?? 0)

  let message =
    '偵測到本機資料曾由較新版本寫入。為避免資料回損，已阻止此舊版開啟帳本。請改安裝相同或更新的版本。'
  if (reason === 'schema_ahead') {
    message =
      `本機資料庫 schema（${floorSchemaVersion}）高於此 App 支援上限（${knownSchemaMax}）。為避免資料回損，已阻止開啟。請改安裝較新版本。`
  } else if (reason === 'app_version_ahead' && floorAppVersion && currentAppVersion) {
    message =
      `本機資料曾由 App ${floorAppVersion} 寫入，目前版本為 ${currentAppVersion}。為避免資料回損，已阻止開啟。請改安裝 ${floorAppVersion} 或更新版本。`
  }

  const error = new Error(message)
  error.code = APP_DOWNGRADE_BLOCKED_CODE
  error.i18nKey = 'app.downgrade_blocked'
  error.reason = reason
  error.floorAppVersion = floorAppVersion || null
  error.currentAppVersion = currentAppVersion || null
  error.floorSchemaVersion = Number.isFinite(floorSchemaVersion) ? floorSchemaVersion : null
  error.knownSchemaMax = Number.isFinite(knownSchemaMax) ? knownSchemaMax : null
  error.recoverable = false
  error.silentWipeBlocked = true
  return error
}

function getLocalStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function readLocalDataFloorPrefs() {
  const storage = getLocalStorage()
  if (!storage) {
    return { appVersion: '', schemaVersion: 0 }
  }
  try {
    const raw = storage.getItem(PREFS_FLOOR_KEY)
    if (!raw) return { appVersion: '', schemaVersion: 0 }
    const parsed = JSON.parse(raw)
    return {
      appVersion: String(parsed?.appVersion ?? '').trim(),
      schemaVersion: Number.parseInt(String(parsed?.schemaVersion ?? '0'), 10) || 0,
    }
  } catch {
    return { appVersion: '', schemaVersion: 0 }
  }
}

export function writeLocalDataFloorPrefs({ appVersion, schemaVersion } = {}) {
  const storage = getLocalStorage()
  if (!storage) return
  const nextApp = String(appVersion ?? '').trim()
  const nextSchema = Number.parseInt(String(schemaVersion ?? '0'), 10) || 0
  const current = readLocalDataFloorPrefs()
  const mergedApp =
    nextApp && (!current.appVersion || compareAppVersions(nextApp, current.appVersion) > 0)
      ? nextApp
      : current.appVersion
  const mergedSchema = Math.max(current.schemaVersion || 0, nextSchema || 0)
  try {
    storage.setItem(
      PREFS_FLOOR_KEY,
      JSON.stringify({
        appVersion: mergedApp,
        schemaVersion: mergedSchema,
        updatedAt: new Date().toISOString(),
      }),
    )
  } catch {
    // private mode / quota — DB schema_meta remains authoritative
  }
}

export function clearLocalDataFloorPrefs() {
  const storage = getLocalStorage()
  if (!storage) return
  try {
    storage.removeItem(PREFS_FLOOR_KEY)
  } catch {
    // noop
  }
}

/**
 * Pure decision helper (unit-testable).
 * @returns {null | { reason: string, ... }}
 */
export function evaluateDataDowngradeRisk({
  knownSchemaMax,
  dbMaxSchemaVersion = 0,
  floorSchemaVersion = 0,
  prefsSchemaVersion = 0,
  floorAppVersion = '',
  prefsAppVersion = '',
  currentAppVersion = '',
} = {}) {
  const knownMax = Number(knownSchemaMax ?? 0) || 0
  const dbMax = Number(dbMaxSchemaVersion ?? 0) || 0
  const floorSchema = Math.max(
    Number(floorSchemaVersion ?? 0) || 0,
    Number(prefsSchemaVersion ?? 0) || 0,
    dbMax,
  )
  if (knownMax > 0 && floorSchema > knownMax) {
    return {
      reason: 'schema_ahead',
      floorSchemaVersion: floorSchema,
      knownSchemaMax: knownMax,
      currentAppVersion,
      floorAppVersion: floorAppVersion || prefsAppVersion || '',
    }
  }

  const floorApp = (() => {
    const meta = String(floorAppVersion ?? '').trim()
    const prefs = String(prefsAppVersion ?? '').trim()
    if (meta && prefs) {
      return compareAppVersions(meta, prefs) >= 0 ? meta : prefs
    }
    return meta || prefs
  })()
  const current = String(currentAppVersion ?? '').trim()
  if (floorApp && current && compareAppVersions(current, floorApp) < 0) {
    return {
      reason: 'app_version_ahead',
      floorAppVersion: floorApp,
      currentAppVersion: current,
      floorSchemaVersion: floorSchema,
      knownSchemaMax: knownMax,
    }
  }
  return null
}

export function assertNoDataDowngrade(input = {}) {
  const risk = evaluateDataDowngradeRisk(input)
  if (!risk) return
  throw createAppDowngradeBlockedError(risk)
}
