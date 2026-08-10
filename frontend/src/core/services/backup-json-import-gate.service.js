/**
 * Structural import gate shared by Drive restore wipe path and importBackupJsonAsNewLedgers.
 * Must reject payloads the formal importer would reject — BEFORE any local wipe.
 */

import { normalizeSharedLedgerSnapshot } from '../../ui/services/shared-ledger/snapshot-merge.js'

function parseJson(text) {
  try {
    return JSON.parse(String(text ?? ''))
  } catch {
    throw new Error('JSON 格式錯誤')
  }
}

/**
 * Same ledger identity rules as import.service resolveSourceLedger.
 * Exported so importer and restore gate cannot drift.
 */
export function resolveSourceLedger(payload) {
  const sourceLedgerId = payload?.ledger_id ?? payload?.tables?.ledgers?.[0]?.id
  if (!sourceLedgerId) {
    throw new Error('JSON 缺少 ledger_id')
  }

  const ledgerRow = payload?.tables?.ledgers?.find((row) => row.id === sourceLedgerId)
    ?? payload?.tables?.ledgers?.[0]
  if (!ledgerRow) {
    throw new Error('JSON 缺少 ledgers 資料')
  }

  return {
    sourceLedgerId,
    ledgerRow,
  }
}

/**
 * Prove jsonText would pass importBackupJsonAsNewLedgers structural checks
 * (parse + all_ledgers non-empty + each ledger resolveSourceLedger after normalize).
 * Does not touch the database and must not be replaced by summary-only checks.
 *
 * @param {string} jsonText
 * @returns {{ mode: 'single'|'all_ledgers', ledgerCount: number }}
 */
export function assertBackupJsonStructureImportable(jsonText) {
  const payload = parseJson(jsonText)
  const allLedgersPayload = Array.isArray(payload?.ledgers) ? payload.ledgers : null

  if (!allLedgersPayload || payload?.backup_scope !== 'all_ledgers') {
    const sanitizedPayload = normalizeSharedLedgerSnapshot(payload)
    resolveSourceLedger(sanitizedPayload)
    return { mode: 'single', ledgerCount: 1 }
  }

  if (!allLedgersPayload.length) {
    throw new Error('JSON 缺少可匯入的帳本資料')
  }

  for (const ledgerPayload of allLedgersPayload) {
    const sanitizedPayload = normalizeSharedLedgerSnapshot(ledgerPayload)
    resolveSourceLedger(sanitizedPayload)
  }

  return { mode: 'all_ledgers', ledgerCount: allLedgersPayload.length }
}
