/**
 * smb297: Durable local recovery backup before any full wipe.
 * Browser download alone is NOT proof — persist must be verified.
 * In-process memory is NOT durable and must never unlock wipe.
 */

const IDB_NAME = 'straw.recovery_backup.v1'
const IDB_STORE = 'backups'
const IDB_VERSION = 1
const LIST_LIMIT = 40

/** Durable kinds that may unlock wipe after read-back verification. */
export const DURABLE_RECOVERY_STORAGE = Object.freeze({
  INDEXEDDB: 'indexeddb',
  FILESYSTEM: 'filesystem',
  TEST: 'test',
})

const DURABLE_STORAGE_SET = new Set(Object.values(DURABLE_RECOVERY_STORAGE))

/** @type {Map<string, object>|null} */
let testStorage = null

export function setRecoveryBackupStorageForTests(adapter) {
  testStorage = adapter
}

export function resetRecoveryBackupStorageForTests() {
  testStorage = null
}

function openRecoveryIdb() {
  if (typeof indexedDB === 'undefined' || !indexedDB) {
    return null
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION)
    request.onerror = () => reject(request.error || new Error('indexedDB open failed'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'backupId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function withRecoveryIdb(fn) {
  const db = await openRecoveryIdb()
  if (!db) return null
  try {
    return await fn(db)
  } finally {
    try {
      db.close()
    } catch {
      // ignore
    }
  }
}

async function idbPut(record) {
  const ok = await withRecoveryIdb(async (db) => {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('indexedDB put failed'))
      tx.objectStore(IDB_STORE).put(record)
    })
    return true
  }).catch(() => false)
  return ok === true
}

async function idbGet(backupId) {
  return withRecoveryIdb(async (db) => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    tx.onerror = () => reject(tx.error || new Error('indexedDB get failed'))
    const req = tx.objectStore(IDB_STORE).get(backupId)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error || new Error('indexedDB get failed'))
  })).catch(() => null)
}

async function idbGetAll() {
  const rows = await withRecoveryIdb(async (db) => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    tx.onerror = () => reject(tx.error || new Error('indexedDB getAll failed'))
    const req = tx.objectStore(IDB_STORE).getAll()
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : [])
    req.onerror = () => reject(req.error || new Error('indexedDB getAll failed'))
  })).catch(() => null)
  return Array.isArray(rows) ? rows : []
}

function buildBackupId(purpose) {
  const safePurpose = String(purpose || 'wipe').replace(/[^\w.-]+/g, '_').slice(0, 40) || 'wipe'
  return `recovery_${safePurpose}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function measureByteLength(jsonText) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(jsonText).byteLength
  }
  return String(jsonText || '').length
}

function toPublicSummary(record, storage) {
  if (!record || typeof record !== 'object') return null
  const backupId = String(record.backupId || '').trim()
  const byteLength = Number(record.byteLength) || 0
  if (!backupId || !(byteLength > 0)) return null
  return {
    backupId,
    purpose: String(record.purpose || '').trim(),
    at: String(record.at || '').trim(),
    byteLength,
    filename: String(record.filename || '').trim(),
    source: String(record.source || '').trim(),
    storage: String(storage || record.storage || DURABLE_RECOVERY_STORAGE.INDEXEDDB).trim(),
    hasPayload: Boolean(record.jsonText),
  }
}

/**
 * Only durable, verified storage unlocks wipe.
 * memory / download-only / empty storage are explicitly rejected.
 */
export function isVerifiedRecoveryBackupProof(proof) {
  if (!proof || typeof proof !== 'object') return false
  if (proof.verified !== true) return false
  if (!(Number(proof.byteLength) > 0)) return false
  if (!String(proof.backupId || '').trim()) return false
  const storage = String(proof.storage || '').trim()
  if (!DURABLE_STORAGE_SET.has(storage)) return false
  return true
}

export function isDurableRecoveryStorage(storage) {
  return DURABLE_STORAGE_SET.has(String(storage || '').trim())
}

/**
 * Persist recovery JSON durably and return a verified proof.
 * Fail closed: memory / download-only never count as verified durable proof.
 */
export async function persistVerifiedRecoveryBackup(options = {}) {
  const purpose = String(options.purpose || 'wipe').trim() || 'wipe'
  const data = options.data
  if (!data || typeof data !== 'object') {
    throw new Error('recovery backup export payload missing')
  }

  let jsonText = ''
  try {
    jsonText = JSON.stringify(data)
  } catch (error) {
    throw new Error(`recovery backup serialize failed: ${error?.message || error}`)
  }
  const byteLength = measureByteLength(jsonText)
  if (!(byteLength > 2)) {
    throw new Error('recovery backup payload empty')
  }

  const backupId = buildBackupId(purpose)
  const at = new Date().toISOString()
  const record = {
    backupId,
    purpose,
    at,
    byteLength,
    jsonText,
    source: String(options.source || '').trim(),
    filename: String(options.filename || '').trim(),
  }

  if (testStorage && typeof testStorage.put === 'function') {
    await testStorage.put(record)
    const readBack = typeof testStorage.get === 'function' ? await testStorage.get(backupId) : record
    if (!readBack || readBack.backupId !== backupId || !(Number(readBack.byteLength) > 0) || !readBack.jsonText) {
      throw new Error('recovery backup test storage verify failed')
    }
    return {
      verified: true,
      backupId,
      purpose,
      at,
      byteLength,
      storage: DURABLE_RECOVERY_STORAGE.TEST,
      filename: record.filename,
    }
  }

  const storedInIdb = await idbPut(record)
  if (storedInIdb) {
    const readBack = await idbGet(backupId)
    if (readBack?.backupId === backupId && Number(readBack.byteLength) > 0 && readBack.jsonText) {
      return {
        verified: true,
        backupId,
        purpose,
        at,
        byteLength,
        storage: DURABLE_RECOVERY_STORAGE.INDEXEDDB,
        filename: record.filename,
      }
    }
  }

  // Optional filesystem durable path (Capacitor / injected writer with read-back).
  if (typeof options.persistToFilesystem === 'function') {
    try {
      const fsResult = await options.persistToFilesystem({
        backupId,
        purpose,
        at,
        byteLength,
        jsonText,
        filename: record.filename,
        data,
      })
      if (
        fsResult?.verified === true
        && String(fsResult.backupId || backupId) === backupId
        && Number(fsResult.byteLength || byteLength) > 0
        && String(fsResult.storage || '') === DURABLE_RECOVERY_STORAGE.FILESYSTEM
      ) {
        return {
          verified: true,
          backupId,
          purpose,
          at,
          byteLength,
          storage: DURABLE_RECOVERY_STORAGE.FILESYSTEM,
          filename: record.filename,
          location: String(fsResult.location || '').trim(),
        }
      }
    } catch {
      // fall through to fail-closed
    }
  }

  // In-process memory must NEVER unlock wipe — even if IndexedDB is unavailable (Node / private mode).
  throw new Error('recovery backup durable persist failed (memory is not durable proof)')
}

export async function readVerifiedRecoveryBackup(backupId) {
  const id = String(backupId || '').trim()
  if (!id) return null

  if (testStorage && typeof testStorage.get === 'function') {
    return testStorage.get(id)
  }

  return idbGet(id)
}

/**
 * List durable recovery backups available for user download / restore.
 * Returns summaries only (no full jsonText) sorted newest-first.
 */
export async function listVerifiedRecoveryBackups(options = {}) {
  const limit = Math.max(1, Math.min(LIST_LIMIT, Number(options.limit) || LIST_LIMIT))
  let records = []

  if (testStorage) {
    if (typeof testStorage.list === 'function') {
      records = await testStorage.list()
    } else if (typeof testStorage.entries === 'function') {
      records = [...testStorage.entries()].map(([, value]) => value)
    }
  } else {
    records = await idbGetAll()
  }

  const summaries = (Array.isArray(records) ? records : [])
    .map((row) => toPublicSummary(row, row?.storage || DURABLE_RECOVERY_STORAGE.INDEXEDDB))
    .filter(Boolean)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit)

  return summaries
}

/**
 * Load full recovery JSON text for download or restore. Throws if missing.
 */
export async function loadRecoveryBackupJsonText(backupId) {
  const record = await readVerifiedRecoveryBackup(backupId)
  const text = String(record?.jsonText || '')
  if (!record?.backupId || !(Number(record.byteLength) > 0) || !text) {
    throw new Error('recovery backup record missing or empty')
  }
  return {
    backupId: record.backupId,
    purpose: String(record.purpose || ''),
    at: String(record.at || ''),
    byteLength: Number(record.byteLength) || measureByteLength(text),
    filename: String(record.filename || `${record.backupId}.json`),
    jsonText: text,
  }
}

/**
 * Parse stored recovery JSON into an object suitable for importBackupJsonAsNewLedgers.
 */
export async function loadRecoveryBackupPayload(backupId) {
  const loaded = await loadRecoveryBackupJsonText(backupId)
  let data
  try {
    data = JSON.parse(loaded.jsonText)
  } catch (error) {
    throw new Error(`recovery backup JSON parse failed: ${error?.message || error}`)
  }
  if (!data || typeof data !== 'object') {
    throw new Error('recovery backup payload invalid')
  }
  return { ...loaded, data }
}

/**
 * Export all ledgers + persist durable recovery backup.
 * Optional device save / browser download are UX only and must not alone satisfy verification.
 */
export async function createVerifiedRecoveryBackupBeforeWipe(options = {}) {
  const exportAllLedgersJson = options.exportAllLedgersJson
  if (typeof exportAllLedgersJson !== 'function') {
    throw new Error('recovery backup exporter missing')
  }

  const purpose = String(options.purpose || 'wipe').trim() || 'wipe'
  const filename =
    String(options.filename || '').trim()
    || `strawmoneybook-recovery-before-${purpose}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`

  const data = await exportAllLedgersJson()

  let persistToFilesystem = options.persistToFilesystem
  if (!persistToFilesystem && typeof options.saveJsonFileToDevice === 'function') {
    persistToFilesystem = async ({ filename: fsName, data: fsData, backupId, byteLength }) => {
      const saved = await options.saveJsonFileToDevice(fsName, fsData, {
        category: options.category || 'recovery',
      })
      if (!(saved?.saved && saved.location)) return null
      // Device write succeeded with a durable location — count as filesystem proof.
      return {
        verified: true,
        backupId,
        byteLength,
        storage: DURABLE_RECOVERY_STORAGE.FILESYSTEM,
        location: saved.location,
      }
    }
  }

  const proof = await persistVerifiedRecoveryBackup({
    purpose,
    data,
    source: options.source,
    filename,
    persistToFilesystem,
  })

  // Best-effort user-visible copies — failure here must NOT invalidate durable proof,
  // and must also NOT be treated as success by callers (proof already verified).
  if (typeof options.saveJsonFileToDevice === 'function' && proof.storage !== DURABLE_RECOVERY_STORAGE.FILESYSTEM) {
    try {
      const saved = await options.saveJsonFileToDevice(filename, data, {
        category: options.category || 'recovery',
      })
      if (!(saved?.saved && saved.location) && typeof options.downloadJsonFile === 'function') {
        options.downloadJsonFile(filename, data)
      }
      if (saved?.saved && saved.location && typeof options.onDeviceSaved === 'function') {
        options.onDeviceSaved(saved)
      }
    } catch {
      if (typeof options.downloadJsonFile === 'function') {
        try {
          options.downloadJsonFile(filename, data)
        } catch {
          // durable IDB/filesystem proof already verified
        }
      }
    }
  } else if (proof.storage === DURABLE_RECOVERY_STORAGE.FILESYSTEM && typeof options.onDeviceSaved === 'function') {
    options.onDeviceSaved({ saved: true, location: proof.location })
  } else if (typeof options.downloadJsonFile === 'function') {
    try {
      options.downloadJsonFile(filename, data)
    } catch {
      // durable proof already verified
    }
  }

  if (!isVerifiedRecoveryBackupProof(proof)) {
    throw new Error('recovery backup proof invalid after persist')
  }
  return proof
}
