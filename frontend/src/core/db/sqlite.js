import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { runMigrations } from '@/core/db/migrate'
import {
  createTransactionContext,
  getActiveTransactionContext,
  runWithTransactionContext,
} from '@/core/db/sqlite-tx-context'
import { sharedSqliteWriteQueue } from '@/core/db/sqlite-write-queue'
import { ensureWebSqliteStoreReady } from '@/core/db/web-store'
import {
  assertExplicitDataWipe,
  createLocalDatabaseIntegrityError,
  recordDataWipeAudit,
} from '@/core/services/data-wipe-guard.service.js'
import { clearLocalDataFloorPrefs } from '@/core/services/data-downgrade-guard.service.js'
import { DATABASE_WIPE_DELETE_ORDER } from '@/core/utils/sqlite-delete-order'
import { rethrowAsForeignKeyError } from '@/core/utils/sqlite-fk'

export const PRIMARY_DB_NAME = 'straw_money_book'
/** @deprecated smb298: never open as live DB — empty recovery caused false "data missing". */
export const RECOVERY_DB_NAME = 'straw_money_book_recovery'
const DB_VERSION = 1

const sqlite = new SQLiteConnection(CapacitorSQLite)
let db = null
let initPromise = null
let activeDbName = PRIMARY_DB_NAME

export function getActiveDatabaseName() {
  return activeDbName
}

export function isUsingPrimaryDatabase() {
  return activeDbName === PRIMARY_DB_NAME
}

function isDataMutationSql(sql) {
  const text = String(sql ?? '').trim()
  if (!text) return false
  const upper = text.toUpperCase()
  const isMutation =
    upper.startsWith('INSERT') ||
    upper.startsWith('UPDATE') ||
    upper.startsWith('DELETE') ||
    upper.startsWith('REPLACE')
  if (!isMutation) return false
  // Ignore settings writes to avoid backup loops when persisting backup state.
  if (upper.includes('APP_SETTINGS')) return false
  return true
}

function emitDataMutationEvent() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  if (typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('app:data-mutated'))
    return
  }
  window.dispatchEvent(new Event('app:data-mutated'))
}

async function persistWebStoreAfterMutation() {
  if (Capacitor.getPlatform() !== 'web') return
  await sqlite.saveToStore(activeDbName)
}

function normalizeErrorMessage(error) {
  if (typeof error === 'string' && error.trim()) return error

  const message = error?.message
  if (typeof message === 'string' && message.trim()) return message

  try {
    const serialized = JSON.stringify(error)
    if (serialized && serialized !== '{}') return serialized
  } catch {
    // noop
  }

  return 'unknown sqlite error'
}

/**
 * Schema-shape errors only. Intentionally excludes generic SQLITE_ERROR (`code 1`)
 * and FOREIGN KEY / 1811 — those must never trigger a silent rebuild/wipe (smb297).
 */
function isSchemaShapeError(error) {
  const message = normalizeErrorMessage(error).toLowerCase()
  if (/foreign\s*key|\b1811\b|sqlite_constraint_foreignkey/.test(message)) return false
  return (
    message.includes('datatype mismatch') ||
    message.includes('no such column') ||
    message.includes('no such table') ||
    message.includes('code20') ||
    message.includes('code 20')
  )
}

function isPluginNullError(error) {
  const message = normalizeErrorMessage(error).toLowerCase()
  return message.includes('capacitorsqliteplugin: null') || message === 'null'
}

function isNoSuchTableError(error) {
  const message = normalizeErrorMessage(error).toLowerCase()
  return message.includes('no such table')
}

async function ensureWebStoreReady() {
  if (Capacitor.getPlatform() !== 'web') return
  await ensureWebSqliteStoreReady()
}

async function closeAllConnectionsSafely() {
  try {
    await sqlite.closeAllConnections()
  } catch {
    // noop
  }
}

/**
 * Android SupportSQLiteDatabase.execSQL rejects PRAGMAs that return a row
 * (foreign_keys / busy_timeout assignments included). query() is safe on all platforms.
 */
async function applyConnectionPragmas(db) {
  await db.query('PRAGMA foreign_keys = ON;')
  await db.query('PRAGMA busy_timeout = 5000;')
}

async function openDatabaseConnection(dbName = activeDbName) {
  const hasConnection = (await sqlite.isConnection(dbName, false)).result

  if (hasConnection) {
    try {
      db = await sqlite.retrieveConnection(dbName, false)
    } catch {
      await closeAllConnectionsSafely()
      db = await sqlite.createConnection(dbName, false, 'no-encryption', DB_VERSION, false)
    }
  } else {
    db = await sqlite.createConnection(dbName, false, 'no-encryption', DB_VERSION, false)
  }

  await db.open()
  await applyConnectionPragmas(db)
  await runMigrations(db)
  activeDbName = dbName
  return db
}

async function rebuildDatabase(dbName = activeDbName) {
  if (db) {
    try {
      await db.close()
    } catch {
      // noop
    }
    db = null
  }

  const hasConnection = (await sqlite.isConnection(dbName, false)).result
  if (hasConnection) {
    const conn = await sqlite.retrieveConnection(dbName, false)
    try {
      await conn.close()
    } catch {
      // noop
    }
    try {
      await sqlite.closeConnection(dbName, false)
    } catch {
      // noop
    }
  }

  await closeAllConnectionsSafely()

  try {
    await sqlite.deleteDatabase(dbName, false)
    return openDatabaseConnection(dbName)
  } catch (deleteError) {
    // Fallback: if deleteDatabase fails on some platforms/devices,
    // wipe all data rows explicitly so "reset all data" still works.
    const conn = await openDatabaseConnection(dbName)
    try {
      // Keep foreign_keys ON (smb296): wipe by child-first order instead of disabling constraints.
      await applyConnectionPragmas(conn)
      for (const table of DATABASE_WIPE_DELETE_ORDER) {
        try {
          await conn.run(`DELETE FROM ${table};`)
        } catch (tableError) {
          if (!isNoSuchTableError(tableError)) {
            rethrowAsForeignKeyError(tableError)
          }
        }
      }
    } catch (wipeError) {
      const deleteMessage = normalizeErrorMessage(deleteError)
      const wipeMessage = normalizeErrorMessage(wipeError)
      throw new Error(`[sqlite] reset fallback failed; delete: ${deleteMessage}; wipe: ${wipeMessage}`)
    }
    return conn
  }
}

/**
 * Full local DB wipe. Requires explicit user-confirmed reason (smb297).
 * Never call from bootstrap / FK repair / migration failure paths.
 * Always targets the primary DB name (smb298: never wipe/switch to empty recovery DB).
 */
export async function resetDatabase(options = {}) {
  const wipe = assertExplicitDataWipe(options)
  recordDataWipeAudit({
    reason: wipe.reason,
    source: wipe.source,
    confirmed: true,
    note: String(options.note ?? '').slice(0, 240),
  })
  clearLocalDataFloorPrefs()
  initPromise = null
  activeDbName = PRIMARY_DB_NAME
  const conn = await rebuildDatabase(PRIMARY_DB_NAME)
  try {
    const { rotateWearSyncEpoch } = await import('@/core/services/wear-sync-epoch.service')
    await rotateWearSyncEpoch()
  } catch {
    // wear_sync_state exists after migration 045; ignore on pre-wear test DBs
  }
  return conn
}

export async function initDatabase() {
  if (db) return db
  if (initPromise) return initPromise

  initPromise = (async () => {
    const platform = Capacitor.getPlatform()

    try {
      await ensureWebStoreReady()
      // smb298: always open primary — never fall through to empty recovery DB as live store.
      return await openDatabaseConnection(PRIMARY_DB_NAME)
    } catch (error) {
      // smb297/smb298: never silent-rebuild / wipe the primary DB on schema or FK errors.
      // smb298 root-cause: plugin-null previously opened straw_money_book_recovery (empty),
      // so users saw "data missing" while primary data remained orphaned. Do NOT open recovery.
      if (platform === 'android' && isPluginNullError(error)) {
        try {
          console.warn('[sqlite] plugin null on primary open — retrying primary (recovery empty-db fallback disabled)')
          await closeAllConnectionsSafely()
          db = null
          return await openDatabaseConnection(PRIMARY_DB_NAME)
        } catch (retryError) {
          initPromise = null
          let primaryExists = false
          try {
            primaryExists = Boolean((await sqlite.isDatabase(PRIMARY_DB_NAME, false))?.result)
          } catch {
            primaryExists = false
          }
          throw createLocalDatabaseIntegrityError(retryError, {
            message: primaryExists
              ? `[sqlite:${platform}] plugin null: primary DB file exists but cannot open (empty recovery fallback disabled): ${normalizeErrorMessage(retryError)}`
              : `[sqlite:${platform}] plugin null on primary open (empty recovery fallback disabled): ${normalizeErrorMessage(retryError)}`,
          })
        }
      }

      initPromise = null
      if (isSchemaShapeError(error)) {
        throw createLocalDatabaseIntegrityError(error, {
          message: `[sqlite:${platform}] schema integrity error (no silent wipe): ${normalizeErrorMessage(error)}`,
        })
      }
      throw createLocalDatabaseIntegrityError(error, {
        message: `[sqlite:${platform}] ${normalizeErrorMessage(error)}`,
      })
    }
  })()

  return initPromise
}

export async function getDatabase() {
  if (!db) {
    await initDatabase()
  }
  return db
}

/**
 * True if any mutation ran inside the outermost transaction (persist once on commit).
 * Bound to the owning TransactionContext for the active outer only.
 */
let pendingTransactionMutation = false

export function getActiveSqliteTransactionDepth() {
  return getActiveTransactionContext()?.depth ?? 0
}

function isInsideOwnedTransaction() {
  const ctx = getActiveTransactionContext()
  return Boolean(ctx && ctx.depth > 0 && ctx.status === 'open')
}

export async function run(sql, values = []) {
  const conn = await getDatabase()
  try {
    // jeep-sqlite / Capacitor: run(..., transaction=true) auto BEGIN+COMMIT per call.
    // Inside withTransaction we must pass false so statements join the outer BEGIN.
    const joinOuter = isInsideOwnedTransaction()
    const result = await conn.run(sql, values, joinOuter ? false : true)
    if (isDataMutationSql(sql)) {
      if (joinOuter) {
        pendingTransactionMutation = true
      } else {
        await persistWebStoreAfterMutation()
        emitDataMutationEvent()
      }
    }
    return result
  } catch (error) {
    rethrowAsForeignKeyError(error)
  }
}

export async function query(sql, values = []) {
  const conn = await getDatabase()
  return conn.query(sql, values)
}

export async function execute(sql) {
  const conn = await getDatabase()
  try {
    const joinOuter = isInsideOwnedTransaction()
    const result = await conn.execute(sql, joinOuter ? false : true)
    if (isDataMutationSql(sql)) {
      if (joinOuter) {
        pendingTransactionMutation = true
      } else {
        await persistWebStoreAfterMutation()
        emitDataMutationEvent()
      }
    }
    return result
  } catch (error) {
    rethrowAsForeignKeyError(error)
  }
}

/**
 * Real SQLite atomic transaction via Capacitor begin/commit/rollback.
 * Outer transactions are serialized by SqliteWriteQueue; each outer owns a
 * TransactionContext. Nested calls inherit that context (no SAVEPOINT).
 * Mutations inside defer IndexedDB persist until successful commit.
 *
 * @param {(conn: unknown, tx?: import('./sqlite-tx-context.js').TransactionContext) => Promise<unknown>} handler
 */
export async function withTransaction(handler) {
  const existing = getActiveTransactionContext()
  if (existing && existing.status === 'open') {
    existing.depth += 1
    try {
      const conn = await getDatabase()
      return await handler(conn, existing)
    } finally {
      existing.depth = Math.max(0, existing.depth - 1)
    }
  }

  return sharedSqliteWriteQueue.enqueue(async () => {
    const ctx = createTransactionContext()
    ctx.depth = 1
    pendingTransactionMutation = false
    const conn = await getDatabase()
    await conn.beginTransaction()
    try {
      const result = await runWithTransactionContext(ctx, async () => handler(conn, ctx))
      ctx.status = 'committing'
      await conn.commitTransaction()
      ctx.status = 'committed'
      if (pendingTransactionMutation) {
        await persistWebStoreAfterMutation()
        emitDataMutationEvent()
      }
      pendingTransactionMutation = false
      return result
    } catch (error) {
      ctx.status = 'rolling_back'
      try {
        await conn.rollbackTransaction()
      } catch {
        // Best-effort rollback; surface the original error.
      }
      ctx.status = 'rolled_back'
      pendingTransactionMutation = false
      throw error
    } finally {
      ctx.depth = 0
    }
  })
}

export async function closeDatabase() {
  if (!db) return
  await sqlite.closeConnection(activeDbName, false)
  db = null
  initPromise = null
}
