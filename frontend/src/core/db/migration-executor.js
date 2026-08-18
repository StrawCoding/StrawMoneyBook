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

async function beginOuter(db) {
  // Capacitor/jeep-sqlite exposes beginTransaction(), but wrapping executeSet
  // migrations in it stalls web bootstrap on "資料載入中". sql.js test doubles
  // only have executeSet, so they still get a real SQL BEGIN/COMMIT.
  if (typeof db.beginTransaction === 'function') {
    return null
  }
  await executeRaw(db, 'BEGIN;')
  return 'sql'
}

async function commitOuter(db, mode) {
  if (mode === 'plugin') {
    await db.commitTransaction()
    return
  }
  if (mode === 'sql') {
    await executeRaw(db, 'COMMIT;')
  }
}

async function rollbackOuter(db, mode) {
  if (mode === 'plugin') {
    await db.rollbackTransaction()
    return
  }
  if (mode === 'sql') {
    await executeRaw(db, 'ROLLBACK;')
  }
}

function isSavepointCandidate(statement) {
  return /^\s*ALTER\s+TABLE\b/i.test(String(statement ?? ''))
}

/**
 * Run a migration file as one SQLite transaction.
 * ALTER TABLE duplicate-column errors stay ignorable via SAVEPOINT
 * so they do not abort the outer transaction (COMPAT-001).
 *
 * Capacitor connections must use beginTransaction() — a raw SQL BEGIN via
 * executeSet can leave jeep-sqlite locked. SAVEPOINTs are only used for ALTER
 * TABLE so first-install CREATE scripts are not 3× slower (bootstrap hang).
 */
export async function executeMigrationSql(db, sql) {
  const statements = buildMigrationStatementSet(sql)
  if (!statements.length) return

  let outerMode = null
  try {
    outerMode = await beginOuter(db)
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
    if (outerMode) {
      await commitOuter(db, outerMode)
    }
  } catch (error) {
    if (outerMode) {
      try {
        await rollbackOuter(db, outerMode)
      } catch {
        // Best-effort rollback; surface the original error.
      }
    }
    throw error
  }
}
