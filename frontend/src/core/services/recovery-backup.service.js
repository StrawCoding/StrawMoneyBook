/**
 * smb297: Durable local recovery backup before any full wipe.
 * Browser download alone is NOT proof — persist must be verified.
 */

const IDB_NAME = 'straw.recovery_backup.v1'
const IDB_STORE = 'backups'
const IDB_VERSION = 1
const MEMORY_FALLBACK_KEY = '__straw_recovery_backup_memory_v1__'

/** @type {Map<string, object>|null} */
let testStorage = null

export function setRecoveryBackupStorageForTests(adapter) {
  testStorage = adapter
}

export function resetRecoveryBackupStorageForTests() {
  testStorage = null
}

function memoryFallbackMap() {
  if (typeof globalThis === 'undefined') return new Map()
  const existing = globalThis[MEMORY_FALLBACK_KEY]
  if (existing instanceof Map) return existing
  const next = new Map()
  globalThis[MEMORY_FALLBACK_KEY] = next
  return next
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

async function idbPut(record) {
  const db = await openRecoveryIdb()
  if (!db) return false
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('indexedDB put failed'))
      tx.objectStore(IDB_STORE).put(record)
    })
    return true
  } finally {
    try {
      db.close()
    } catch {
      // ignore
    }
  }
}

async function idbGet(backupId) {
  const db = await openRecoveryIdb()
  if (!db) return null
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      tx.onerror = () => reject(tx.error || new Error('indexedDB get failed'))
      const req = tx.objectStore(IDB_STORE).get(backupId)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error || new Error('indexedDB get failed'))
    })
  } finally {
    try {
      db.close()
    } catch {
      // ignore
    }
  }
}

function buildBackupId(purpose) {
  const safePurpose = String(purpose || 'wipe').replace(/[^\w.-]+/g, '_').slice(0, 40) || 'wipe'
  return `recovery_${safePurpose}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function isVerifiedRecoveryBackupProof(proof) {
  if (!proof || typeof proof !== 'object') return false
  if (proof.verified !== true) return false
  if (!(Number(proof.byteLength) > 0)) return false
  if (!String(proof.backupId || '').trim()) return false
  if (!String(proof.storage || '').trim()) return false
  return true
}

/**
 * Persist recovery JSON durably and return a verified proof.
 * Fail closed: if persistence cannot be verified, throw.
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
  const byteLength = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(jsonText).byteLength
    : jsonText.length
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
    if (!readBack || readBack.backupId !== backupId || !(Number(readBack.byteLength) > 0)) {
      throw new Error('recovery backup test storage verify failed')
    }
    return {
      verified: true,
      backupId,
      purpose,
      at,
      byteLength,
      storage: 'test',
      filename: record.filename,
    }
  }

  const storedInIdb = await idbPut(record).catch(() => false)
  if (storedInIdb) {
    const readBack = await idbGet(backupId).catch(() => null)
    if (readBack?.backupId === backupId && Number(readBack.byteLength) > 0 && readBack.jsonText) {
      return {
        verified: true,
        backupId,
        purpose,
        at,
        byteLength,
        storage: 'indexeddb',
        filename: record.filename,
      }
    }
  }

  // Node / environments without IndexedDB: in-memory map (still verifiable in-process).
  if (typeof indexedDB === 'undefined' || !indexedDB) {
    const map = memoryFallbackMap()
    map.set(backupId, record)
    const readBack = map.get(backupId)
    if (readBack?.backupId === backupId && Number(readBack.byteLength) > 0) {
      return {
        verified: true,
        backupId,
        purpose,
        at,
        byteLength,
        storage: 'memory',
        filename: record.filename,
      }
    }
  }

  throw new Error('recovery backup durable persist failed')
}

export async function readVerifiedRecoveryBackup(backupId) {
  const id = String(backupId || '').trim()
  if (!id) return null

  if (testStorage && typeof testStorage.get === 'function') {
    return testStorage.get(id)
  }

  const fromIdb = await idbGet(id).catch(() => null)
  if (fromIdb) return fromIdb

  const map = memoryFallbackMap()
  return map.get(id) || null
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
  const proof = await persistVerifiedRecoveryBackup({
    purpose,
    data,
    source: options.source,
    filename,
  })

  // Best-effort user-visible copies — failure here must NOT invalidate durable proof,
  // but must also NOT be treated as success by callers (proof already verified).
  if (typeof options.saveJsonFileToDevice === 'function') {
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
          // durable IDB/memory proof already verified
        }
      }
    }
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
