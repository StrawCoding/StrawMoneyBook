import { query, run } from '@/core/db/sqlite'
import { createId, nowIso } from '@/core/utils/id'
import { assertLedgerId, firstRow, rowsOf } from '@/core/repositories/base.repo'

export async function listCounterparties(ledgerId) {
  assertLedgerId(ledgerId)
  const result = await query(
    `SELECT ledger_id, id, name, contact_json, note, is_archived, created_at, updated_at
     FROM counterparties
     WHERE ledger_id = ?
       AND is_archived = 0
     ORDER BY name COLLATE NOCASE ASC;`,
    [ledgerId],
  )

  return rowsOf(result)
}

export async function getCounterpartyByName(ledgerId, name) {
  assertLedgerId(ledgerId)
  const normalized = name.trim()

  const result = await query(
    `SELECT ledger_id, id, name, note, is_archived
     FROM counterparties
     WHERE ledger_id = ?
       AND lower(name) = lower(?)
     LIMIT 1;`,
    [ledgerId, normalized],
  )

  return firstRow(result)
}

export async function createCounterparty(ledgerId, input) {
  assertLedgerId(ledgerId)
  const id = input.id ?? createId('cp')
  const now = nowIso()

  await run(
    `INSERT INTO counterparties (
      ledger_id, id, name, contact_json, note, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?);`,
    [ledgerId, id, input.name.trim(), input.contactJson ?? null, input.note ?? null, now, now],
  )

  return {
    ledger_id: ledgerId,
    id,
    name: input.name.trim(),
    note: input.note ?? null,
    is_archived: 0,
  }
}

export async function ensureCounterpartyByName(ledgerId, name) {
  assertLedgerId(ledgerId)
  const trimmed = name?.trim()
  if (!trimmed) return null

  const existing = await getCounterpartyByName(ledgerId, trimmed)
  if (existing) {
    if (existing.is_archived) {
      await run('UPDATE counterparties SET is_archived = 0, updated_at = ? WHERE ledger_id = ? AND id = ?;', [
        nowIso(),
        ledgerId,
        existing.id,
      ])
    }
    return existing.id
  }

  const created = await createCounterparty(ledgerId, { name: trimmed })
  return created.id
}
