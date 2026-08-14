import { query, run } from '../db/sqlite.js'
import { nowIso } from '../utils/id.js'
import { firstRow } from './base.repo.js'

export async function getSetting(ledgerId, key) {
  const result = await query(
    `SELECT value_json
     FROM app_settings
     WHERE ledger_id = ? AND key = ?
     LIMIT 1;`,
    [ledgerId, key],
  )

  const row = firstRow(result)
  if (!row) return null
  try {
    return JSON.parse(row.value_json)
  } catch (_error) {
    return null
  }
}

export async function setSetting(ledgerId, key, value) {
  await run(
    `INSERT INTO app_settings (ledger_id, key, value_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ledger_id, key)
     DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;`,
    [ledgerId, key, JSON.stringify(value), nowIso()],
  )
}

export async function removeSetting(ledgerId, key) {
  await run(
    `DELETE FROM app_settings
     WHERE ledger_id = ? AND key = ?;`,
    [ledgerId, key],
  )
}

export async function listAppSettingRows(ledgerId) {
  const result = await query(
    `SELECT key, value_json, updated_at
     FROM app_settings
     WHERE ledger_id = ?;`,
    [ledgerId],
  )
  return Array.isArray(result?.values) ? result.values : []
}

export async function upsertAppSettingRow(ledgerId, row = {}) {
  await run(
    `INSERT INTO app_settings (ledger_id, key, value_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ledger_id, key)
     DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at;`,
    [
      ledgerId,
      String(row?.key ?? '').trim(),
      String(row?.value_json ?? 'null'),
      String(row?.updated_at ?? '').trim() || nowIso(),
    ],
  )
}
