import { query, run } from '@/core/db/sqlite'
import { nowIso } from '@/core/utils/id'
import { firstRow } from '@/core/repositories/base.repo'

function randomEpoch() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const time = Date.now().toString(16)
  const random = Math.random().toString(16).slice(2, 18).padEnd(16, '0')
  return `${time}${random}`.replace(/(.{8})(.{4})(.{4})(.{4})(.{12}).*/, '$1-$2-$3-$4-$5')
}

export async function getWearSyncState() {
  const row = firstRow(await query(
    `SELECT sync_epoch, snapshot_revision, ledger_revision, catalog_revision, updated_at
     FROM wear_sync_state WHERE id = 1 LIMIT 1;`,
  ))
  if (!row) {
    return rotateWearSyncEpoch()
  }
  return {
    syncEpoch: String(row.sync_epoch),
    snapshotRevision: Number(row.snapshot_revision) || 0,
    ledgerRevision: Number(row.ledger_revision) || 0,
    catalogRevision: Number(row.catalog_revision) || 0,
    updatedAt: row.updated_at,
  }
}

export async function rotateWearSyncEpoch() {
  const epoch = randomEpoch()
  const updatedAt = nowIso()
  await run(
    `INSERT INTO wear_sync_state (id, sync_epoch, snapshot_revision, ledger_revision, catalog_revision, updated_at)
     VALUES (1, ?, 0, 0, 0, ?)
     ON CONFLICT(id) DO UPDATE SET
       sync_epoch = excluded.sync_epoch,
       snapshot_revision = 0,
       ledger_revision = 0,
       catalog_revision = 0,
       updated_at = excluded.updated_at;`,
    [epoch, updatedAt],
  )
  return {
    syncEpoch: epoch,
    snapshotRevision: 0,
    ledgerRevision: 0,
    catalogRevision: 0,
    updatedAt,
  }
}

export async function bumpWearSnapshotRevision() {
  const updatedAt = nowIso()
  await run(
    `UPDATE wear_sync_state
     SET snapshot_revision = snapshot_revision + 1, updated_at = ?
     WHERE id = 1;`,
    [updatedAt],
  )
  return getWearSyncState()
}

export async function bumpWearLedgerAndCatalogRevisions({ ledger = false, catalog = false } = {}) {
  const updatedAt = nowIso()
  await run(
    `UPDATE wear_sync_state
     SET ledger_revision = ledger_revision + ?,
         catalog_revision = catalog_revision + ?,
         snapshot_revision = snapshot_revision + 1,
         updated_at = ?
     WHERE id = 1;`,
    [ledger ? 1 : 0, catalog ? 1 : 0, updatedAt],
  )
  return getWearSyncState()
}
