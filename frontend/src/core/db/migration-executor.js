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

export async function executeMigrationSql(db, sql) {
  const statements = buildMigrationStatementSet(sql)

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
