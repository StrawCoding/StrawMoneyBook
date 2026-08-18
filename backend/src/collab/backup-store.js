import Database from 'better-sqlite3'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_DB_FILE_PATH = fileURLToPath(new URL('../../.server-data/collab-store.sqlite', import.meta.url))
const DEFAULT_BACKUP_DIR = fileURLToPath(new URL('../../.server-data/backups', import.meta.url))
const BACKUP_FILE_PATTERN = /^collab-store-\d{8}T\d{6}Z\.sqlite$/

export function resolveCollabDbPath({
  dbFile = process.env.SHARED_LEDGER_DB_FILE,
  dataFile = process.env.SHARED_LEDGER_DATA_FILE,
} = {}) {
  const configuredDb = String(dbFile ?? '').trim()
  if (configuredDb) return resolve(configuredDb)
  const configuredData = String(dataFile ?? '').trim()
  if (configuredData.endsWith('.sqlite')) return resolve(configuredData)
  return DEFAULT_DB_FILE_PATH
}

export function resolveCollabBackupDir(backupDir = process.env.SHARED_LEDGER_BACKUP_DIR) {
  const configured = String(backupDir ?? '').trim()
  return configured ? resolve(configured) : DEFAULT_BACKUP_DIR
}

export function formatCollabBackupStamp(now = new Date()) {
  const iso = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  return iso
}

export async function backupSqliteFile(sourcePath, destPath) {
  const db = new Database(sourcePath, { readonly: true, fileMustExist: true })
  try {
    await db.backup(destPath)
  } finally {
    db.close()
  }
}

export async function pruneCollabBackups(backupDir, keep = 14) {
  const keepCount = Math.max(1, Number(keep) || 14)
  const names = (await readdir(backupDir).catch(() => []))
    .filter((name) => BACKUP_FILE_PATTERN.test(name))
    .sort()
  const stale = names.slice(0, Math.max(0, names.length - keepCount))
  for (const name of stale) {
    await unlink(join(backupDir, name))
  }
  return {
    kept: names.slice(stale.length).map((name) => join(backupDir, name)),
    pruned: stale.map((name) => join(backupDir, name)),
  }
}

export async function backupCollabStore({
  sourcePath = resolveCollabDbPath(),
  backupDir = resolveCollabBackupDir(),
  now = new Date(),
  keep = Number(process.env.SHARED_LEDGER_BACKUP_KEEP ?? 14),
} = {}) {
  await mkdir(backupDir, { recursive: true })
  const destPath = join(backupDir, `collab-store-${formatCollabBackupStamp(now)}.sqlite`)
  await backupSqliteFile(sourcePath, destPath)
  const prune = await pruneCollabBackups(backupDir, keep)
  return {
    sourcePath: resolve(sourcePath),
    destPath,
    destName: basename(destPath),
    ...prune,
  }
}
