import { splitSqlStatements } from './sql-statements.js'

export function isIgnorableMigrationError(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase()
  return (
    message.includes('duplicate column name') ||
    message.includes('already exists') ||
    message.includes('duplicate index name')
  )
}

export function buildMigrationStatementSet(sql) {
  return splitSqlStatements(sql).map((statement) => ({
    statement,
    values: [],
  }))
}

async function executeRaw(db, statement) {
  await db.executeSet([{ statement, values: [] }])
}

function savepointName(index) {
  return `mig_sp_${index}`
}

function isPluginConnection(db) {
  return typeof db?.beginTransaction === 'function'
}

function isSavepointCandidate(statement) {
  return /^\s*ALTER\s+TABLE\b/i.test(String(statement ?? ''))
}

/**
 * Capacitor/jeep-sqlite: never issue SQL BEGIN / SAVEPOINT / COMMIT via executeSet.
 * Those statements deadlock the web worker and leave the app on 「資料載入中」.
 * Duplicate-column ALTER errors stay ignorable per statement (no outer txn).
 */
async function executePluginStatements(db, statements) {
  for (const item of statements) {
    try {
      await db.executeSet([item])
    } catch (error) {
      if (!isIgnorableMigrationError(error)) {
        throw error
      }
    }
  }
}

/**
 * sql.js / test doubles (COMPAT-001): wrap the file in one transaction.
 * ALTER TABLE duplicate-column errors use SAVEPOINT so they do not abort the rest.
 */
async function executeSqlJsStatements(db, statements) {
  let began = false
  try {
    await executeRaw(db, 'BEGIN;')
    began = true
  } catch {
    // Already inside a transaction (or engine auto-begins). Continue with statements.
  }

  try {
    for (let index = 0; index < statements.length; index += 1) {
      const item = statements[index]
      const useSavepoint = isSavepointCandidate(item.statement)
      const sp = savepointName(index)
      if (useSavepoint) {
        await executeRaw(db, `SAVEPOINT ${sp};`)
      }
      try {
        await db.executeSet([item])
        if (useSavepoint) {
          await executeRaw(db, `RELEASE ${sp};`)
        }
      } catch (error) {
        if (useSavepoint) {
          try {
            await executeRaw(db, `ROLLBACK TO ${sp};`)
          } catch {
            // ignore nested rollback failure; surface original error if not ignorable
          }
          try {
            await executeRaw(db, `RELEASE ${sp};`)
          } catch {
            // ignore
          }
        }
        if (!isIgnorableMigrationError(error)) {
          throw error
        }
      }
    }
    if (began) {
      await executeRaw(db, 'COMMIT;')
    }
  } catch (error) {
    if (began) {
      try {
        await executeRaw(db, 'ROLLBACK;')
      } catch {
        // Best-effort rollback; surface the original error.
      }
    }
    throw error
  }
}

/**
 * Run a migration file.
 *
 * Plugin connections (Capacitor / jeep-sqlite) stay on the original per-statement
 * executeSet path. sql.js doubles keep COMPAT-001 atomicity via BEGIN + SAVEPOINT.
 */
export async function executeMigrationSql(db, sql) {
  const statements = buildMigrationStatementSet(sql)
  if (!statements.length) return

  if (isPluginConnection(db)) {
    await executePluginStatements(db, statements)
    return
  }

  await executeSqlJsStatements(db, statements)
}
