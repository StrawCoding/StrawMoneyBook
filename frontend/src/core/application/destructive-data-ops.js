/**
 * ART-13 — Destructive ledger replace with durable recovery (application use-case).
 * UI / sync services call this; they must not invent wipe-without-proof paths.
 */
import { tagAppError } from '../domain/errors.js'

/**
 * @param {object} input
 * @param {string} input.ledgerId
 * @param {object | null} input.existingLedger
 * @param {object | null} input.existingSnapshot
 * @param {string} input.purpose
 * @param {string} input.source
 * @param {() => Promise<unknown>} input.performReplace
 * @param {object} input.deps
 */
export async function replaceLedgerWithDurableRecovery(input) {
  const {
    ledgerId,
    existingLedger,
    existingSnapshot,
    purpose,
    source,
    performReplace,
    deps,
  } = input

  const {
    requireRecoveryBackupBeforeWipe,
    persistVerifiedRecoveryBackup,
    readVerifiedRecoveryBackup,
    purgeLedger,
    importLedgerJsonAsNewLedger,
  } = deps

  let purgedExistingLedger = false
  /** @type {{ backupId?: string } | null} */
  let recoveryProof = null

  try {
    if (existingLedger && existingSnapshot) {
      recoveryProof = await requireRecoveryBackupBeforeWipe(
        () => persistVerifiedRecoveryBackup({
          purpose,
          data: existingSnapshot,
          source,
          filename: `strawmoneybook-recovery-${purpose}-${ledgerId}.json`,
        }),
        {
          source,
          i18nKey: 'shared_ledger.error.recovery_backup_required',
        },
      )
      await purgeLedger(ledgerId)
      purgedExistingLedger = true
    }

    return await performReplace()
  } catch (error) {
    if (purgedExistingLedger) {
      let restoredText = ''
      if (recoveryProof?.backupId) {
        try {
          const durable = await readVerifiedRecoveryBackup(recoveryProof.backupId)
          restoredText = String(durable?.jsonText ?? '').trim()
        } catch {
          restoredText = ''
        }
      }
      if (!restoredText && existingSnapshot) {
        restoredText = JSON.stringify(existingSnapshot)
      }
      if (restoredText) {
        try {
          await purgeLedger(ledgerId)
          await importLedgerJsonAsNewLedger(restoredText, {
            keepLedgerId: true,
            ledgerName: existingLedger?.name,
            runIntegrityRepair: false,
          })
        } catch (restoreError) {
          const wrapped = new Error(
            `帳本替換失敗且本機還原也失敗：${String(error?.message ?? error)}; restore: ${String(restoreError?.message ?? restoreError)}`,
          )
          wrapped.code = 'shared_ledger_replace_restore_failed'
          wrapped.cause = error
          wrapped.restoreError = restoreError
          throw tagAppError(wrapped, { kind: 'recovery', code: 'shared_ledger_replace_restore_failed', retriable: false })
        }
      }
    }
    throw tagAppError(error instanceof Error ? error : new Error(String(error)))
  }
}
