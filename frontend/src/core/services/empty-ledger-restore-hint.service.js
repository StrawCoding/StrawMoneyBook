/**
 * smb298: When the live DB opens empty but durable recovery backups exist,
 * surface a restore hint so users are not pushed only into "create new ledger".
 * Does not invent server-side personal transaction restores (collab-store has none).
 */

import { listVerifiedRecoveryBackups } from './recovery-backup.service.js'

export const EMPTY_LEDGER_RESTORE_HINT_EVENT = 'app:empty-ledger-restore-hint'

/**
 * @param {{ hasLedgers?: boolean, hasAccounts?: boolean, listRecovery?: () => Promise<object[]> }} [options]
 * @returns {Promise<{ shouldPrompt: boolean, recoveryCount: number, backups: object[] }>}
 */
export async function detectEmptyLedgerRestoreHint(options = {}) {
  const hasLedgers = Boolean(options.hasLedgers)
  const hasAccounts = Boolean(options.hasAccounts)
  const listRecovery = typeof options.listRecovery === 'function'
    ? options.listRecovery
    : listVerifiedRecoveryBackups

  if (hasLedgers && hasAccounts) {
    return { shouldPrompt: false, recoveryCount: 0, backups: [] }
  }

  let backups = []
  try {
    backups = await listRecovery()
  } catch {
    backups = []
  }
  if (!Array.isArray(backups)) backups = []

  const recoveryCount = backups.length
  return {
    shouldPrompt: recoveryCount > 0 && !hasLedgers,
    recoveryCount,
    backups,
  }
}

export function emitEmptyLedgerRestoreHint(detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  const payload = detail && typeof detail === 'object' ? detail : {}
  if (typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent(EMPTY_LEDGER_RESTORE_HINT_EVENT, { detail: payload }))
    return
  }
  window.dispatchEvent(new Event(EMPTY_LEDGER_RESTORE_HINT_EVENT))
}
