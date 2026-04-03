import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { runMigrations } from '@/core/db/migrate'
import { ensureWebSqliteStoreReady } from '@/core/db/web-store'

const PRIMARY_DB_NAME = 'straw_money_book'
const RECOVERY_DB_NAME = 'straw_money_book_recovery'
const DB_VERSION = 1
const RESET_TABLES = [
  'transaction_attachments',
  'loan_payments',
  'reimbursement_advance_usages',
  'reimbursement_advances',
  'reimbursement_items',
  'reimbursements',
  'budget_save_settlements',
  'budget_items',
  'budgets',
  'loans',
  'bank_sync_rules',
  'bank_transactions',
  'bank_accounts',
  'bank_connections',
  'transactions',
  'savings_jars',
  'accounts',
  'account_groups',
  'categories',
  'category_groups',
  'counterparties',
  'app_settings',
  'deleted_log',
  'ledgers',
]

const sqlite = new SQLiteConnection(CapacitorSQLite)
let db = null
let initPromise = null
let activeDbName = PRIMARY_DB_NAME

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

function isRecoverableSchemaError(error) {
  const message = normalizeErrorMessage(error).toLowerCase()
  return (
    message.includes('datatype mismatch') ||
    message.includes('no such column') ||
    message.includes('no such table') ||
    message.includes('code20') ||
    message.includes('code 20') ||
    message.includes('code 1')
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
  await db.execute('PRAGMA foreign_keys = ON;')
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
      await conn.execute('PRAGMA foreign_keys = OFF;')
      for (const table of RESET_TABLES) {
        try {
          await conn.run(`DELETE FROM ${table};`)
        } catch (tableError) {
          if (!isNoSuchTableError(tableError)) {
            throw tableError
          }
        }
      }
    } catch (wipeError) {
      const deleteMessage = normalizeErrorMessage(deleteError)
      const wipeMessage = normalizeErrorMessage(wipeError)
      throw new Error(`[sqlite] reset fallback failed; delete: ${deleteMessage}; wipe: ${wipeMessage}`)
    } finally {
      try {
        await conn.execute('PRAGMA foreign_keys = ON;')
      } catch {
        // noop
      }
    }
    return conn
  }
}

async function openRecoveryDatabase() {
  await closeAllConnectionsSafely()
  db = null
  return openDatabaseConnection(RECOVERY_DB_NAME)
}

export async function resetDatabase() {
  initPromise = null
  return rebuildDatabase(activeDbName)
}

export async function initDatabase() {
  if (db) return db
  if (initPromise) return initPromise

  initPromise = (async () => {
    const platform = Capacitor.getPlatform()

    try {
      await ensureWebStoreReady()
      return await openDatabaseConnection(activeDbName)
    } catch (error) {
      if (platform === 'android' && isRecoverableSchemaError(error)) {
        try {
          console.warn('[sqlite] detected recoverable schema error, rebuilding local database')
          return await rebuildDatabase(activeDbName)
        } catch (recoveryError) {
          try {
            console.warn('[sqlite] rebuild failed, switching to recovery database')
            return await openRecoveryDatabase()
          } catch (fallbackError) {
            initPromise = null
            const recoveryMessage = normalizeErrorMessage(recoveryError)
            const fallbackMessage = normalizeErrorMessage(fallbackError)
            throw new Error(
              `[sqlite:${platform}] recovery failed after schema error: ${recoveryMessage}; recovery-db failed: ${fallbackMessage}`,
            )
          }
        }
      }

      if (platform === 'android' && isPluginNullError(error)) {
        try {
          console.warn('[sqlite] plugin null error, switching to recovery database')
          return await openRecoveryDatabase()
        } catch (fallbackError) {
          initPromise = null
          const fallbackMessage = normalizeErrorMessage(fallbackError)
          throw new Error(`[sqlite:${platform}] plugin null, recovery-db failed: ${fallbackMessage}`)
        }
      }

      initPromise = null
      const message = normalizeErrorMessage(error)
      throw new Error(`[sqlite:${platform}] ${message}`)
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

export async function run(sql, values = []) {
  const conn = await getDatabase()
  const result = await conn.run(sql, values)
  if (isDataMutationSql(sql)) {
    emitDataMutationEvent()
  }
  return result
}

export async function query(sql, values = []) {
  const conn = await getDatabase()
  return conn.query(sql, values)
}

export async function execute(sql) {
  const conn = await getDatabase()
  return conn.execute(sql)
}

export async function withTransaction(handler) {
  const conn = await getDatabase()
  // NOTE:
  // In current web stack, run/execute already wrap statements in their own
  // transaction boundaries. Nesting begin/commit here causes
  // "cannot commit/rollback - no transaction is active" errors.
  // Keep this helper as a logical boundary only.
  return handler(conn)
}

export async function closeDatabase() {
  if (!db) return
  await sqlite.closeConnection(activeDbName, false)
  db = null
  initPromise = null
}
