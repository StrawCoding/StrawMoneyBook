/**
 * Migration numbers that were shipped then removed.
 * Reusing them would skip execution on devices that already have
 * schema_migrations rows for those versions.
 */
export const RESERVED_MIGRATION_VERSIONS = Object.freeze([20, 21, 22, 27, 29])

export function assertNoReservedMigrationVersions(migrations) {
  const reserved = new Set(RESERVED_MIGRATION_VERSIONS)
  const reused = [...new Set(
    (migrations ?? [])
      .map((item) => Number(item?.version))
      .filter((version) => reserved.has(version)),
  )].sort((left, right) => left - right)

  if (reused.length > 0) {
    throw new Error(
      `Do NOT reuse reserved migration versions ${reused.join(', ')} — existing devices would skip the new SQL.`,
    )
  }
}
