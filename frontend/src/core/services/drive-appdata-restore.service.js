/**
 * smb299: Drive appData 選檔／revision 還原编排。
 * 必須：完成可匯入預覽 → 再下載並驗證可匯入 → durable recovery → wipe → import。
 * 預覽失敗／不可匯入／recovery 失敗皆不得清空本機。
 * wipe 後若 import 仍失敗：立即以 durable recovery 回灌本機（失敗不清空語意）。
 */

import { summarizeBackupJsonText } from './backup-json-preview.service.js'
import { assertBackupJsonStructureImportable } from './backup-json-import-gate.service.js'
import {
  RECOVERY_BACKUP_REQUIRED_CODE,
  runConfirmedWipeAfterRecoveryBackup,
} from './data-wipe-guard.service.js'

export const DRIVE_RESTORE_PREVIEW_REQUIRED_CODE = 'DRIVE_RESTORE_PREVIEW_REQUIRED'
export const DRIVE_RESTORE_NOT_IMPORTABLE_CODE = 'DRIVE_RESTORE_NOT_IMPORTABLE'
export const DRIVE_RESTORE_IMPORT_FAILED_RESTORED_CODE = 'DRIVE_RESTORE_IMPORT_FAILED_RESTORED'

export function createDriveRestorePreviewRequiredError(cause, options = {}) {
  const originalMessage = String(cause?.message ?? cause ?? '').trim()
  const message =
    String(options.message ?? '').trim()
    || '還原前必須完成可匯入的備份預覽。預覽失敗或內容無法解析時，禁止進入清空本機流程。'
  const error = new Error(message)
  error.code = DRIVE_RESTORE_PREVIEW_REQUIRED_CODE
  error.i18nKey = options.i18nKey || 'settings_auto_backup.drive_browser.preview_required'
  error.originalMessage = originalMessage
  error.silentWipeBlocked = true
  return error
}

export function createDriveRestoreNotImportableError(cause, options = {}) {
  const originalMessage = String(cause?.message ?? cause ?? '').trim()
  const parseError = String(options.parseError ?? '').trim()
  const message =
    String(options.message ?? '').trim()
    || `選定的 Drive 檔／舊版無法匯入（${parseError || originalMessage || 'invalid_backup'}）。已中止，不清空本機。`
  const error = new Error(message)
  error.code = DRIVE_RESTORE_NOT_IMPORTABLE_CODE
  error.i18nKey = options.i18nKey || 'settings_auto_backup.drive_browser.not_importable'
  error.parseError = parseError || originalMessage
  error.originalMessage = originalMessage
  error.silentWipeBlocked = true
  return error
}

export function createDriveRestoreImportFailedRestoredError(cause, options = {}) {
  const originalMessage = String(cause?.message ?? cause ?? '').trim()
  const message =
    String(options.message ?? '').trim()
    || `雲端備份匯入失敗（${originalMessage || 'import_failed'}）。已從本機 durable recovery 回滾，本機資料未清空。`
  const error = new Error(message)
  error.code = DRIVE_RESTORE_IMPORT_FAILED_RESTORED_CODE
  error.i18nKey = options.i18nKey || 'settings_auto_backup.drive_browser.import_failed_restored'
  error.originalMessage = originalMessage
  error.localDataRestoredFromRecovery = true
  error.silentWipeBlocked = true
  if (cause && typeof cause === 'object') {
    try {
      error.cause = cause
    } catch {
      // ignore
    }
  }
  return error
}

/**
 * Backup JSON must pass BOTH preview summary AND formal importer structure+row checks
 * before wipe is allowed. Summary-only / ledger-id-only is insufficient.
 */
export function assertBackupJsonImportable(jsonText, options = {}) {
  const text = String(jsonText ?? '')
  if (!text.trim()) {
    throw createDriveRestoreNotImportableError(new Error('empty_json'), {
      ...options,
      parseError: 'empty_json',
    })
  }
  const summary = summarizeBackupJsonText(text)
  if (!summary.ok) {
    throw createDriveRestoreNotImportableError(new Error(summary.parseError || 'invalid_backup'), {
      ...options,
      parseError: summary.parseError || 'invalid_backup',
    })
  }
  try {
    assertBackupJsonStructureImportable(text)
  } catch (error) {
    if (error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE) {
      throw error
    }
    throw createDriveRestoreNotImportableError(error, {
      ...options,
      parseError: String(error?.message ?? 'importer_structure_rejected').trim() || 'importer_structure_rejected',
    })
  }
  return summary
}

/**
 * Confirm dialog / wipe must only proceed with a completed, importable preview.
 */
export function assertDriveRestorePreviewReady(preview, options = {}) {
  if (!preview || typeof preview !== 'object') {
    throw createDriveRestorePreviewRequiredError(new Error('preview_missing'), options)
  }
  if (!String(preview.jsonText ?? '').trim()) {
    throw createDriveRestorePreviewRequiredError(new Error('preview_json_missing'), options)
  }
  try {
    assertBackupJsonImportable(preview.jsonText, options)
  } catch (error) {
    if (error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE) {
      throw createDriveRestorePreviewRequiredError(error, {
        ...options,
        message: error.message,
      })
    }
    throw error
  }
  return preview
}

export function isDriveRestorePreviewReady(preview) {
  try {
    assertDriveRestorePreviewReady(preview)
    return true
  } catch {
    return false
  }
}

/**
 * Wipe then import with mandatory durable-recovery rollback if import fails.
 * Callers must already have proven the import payload is gate-importable.
 *
 * Platform note: withTransaction() uses Capacitor begin/commit/rollback (smb300);
 * nested run() joins the outer tx (transaction:false). Still prefer wipe+restore
 * recovery here because import spans many statements and external I/O.
 * A mid-import failure can leave partially committed ledgers/rows. Therefore recovery
 * MUST wipe again to clear residue before rehydrating wipe-前原狀 from durable proof.
 */
export async function runConfirmedWipeThenImportWithRecoveryRollback({
  createRecoveryBackup,
  wipeFn,
  importFn,
  restoreFromRecovery,
  source,
  i18nKey,
} = {}) {
  if (typeof importFn !== 'function') {
    throw createDriveRestoreNotImportableError(new Error('import_missing'), {
      parseError: 'import_missing',
    })
  }

  const recoveryProof = await runConfirmedWipeAfterRecoveryBackup({
    createRecoveryBackup,
    wipeFn,
    source,
    i18nKey,
  })

  try {
    const imported = await importFn()
    return { imported, recoveryProof }
  } catch (importError) {
    if (typeof restoreFromRecovery !== 'function') {
      throw createDriveRestoreNotImportableError(importError, {
        parseError: 'import_failed_after_wipe_no_rollback',
        message: `備份匯入失敗且無法回滾（缺少 restoreFromRecovery）：${String(importError?.message ?? importError ?? '').trim() || 'import_failed'}`,
      })
    }

    // Clear any partially-committed import residue before recovery rehydrate.
    // Without this, restoreFromRecovery that only INSERT recovery JSON would leave
    // original local data PLUS leftover cloud rows — not wipe-前原狀.
    try {
      await wipeFn()
    } catch (clearError) {
      const error = createDriveRestoreNotImportableError(importError, {
        parseError: 'import_failed_partial_clear_failed',
        message: `備份匯入失敗，且清除部分匯入殘留亦失敗：${String(clearError?.message ?? clearError ?? '').trim() || 'partial_clear_failed'}`,
      })
      error.localDataRestoredFromRecovery = false
      error.clearError = clearError
      throw error
    }

    try {
      await restoreFromRecovery(recoveryProof)
    } catch (rollbackError) {
      const error = createDriveRestoreNotImportableError(importError, {
        parseError: 'import_failed_rollback_failed',
        message: `備份匯入失敗，且 durable recovery 回滾亦失敗：${String(rollbackError?.message ?? rollbackError ?? '').trim() || 'rollback_failed'}`,
      })
      error.localDataRestoredFromRecovery = false
      error.rollbackError = rollbackError
      throw error
    }
    throw createDriveRestoreImportFailedRestoredError(importError)
  }
}

/**
 * Full restore path used by DriveAppDataRestorePanel.
 * Order: preview gate → download+importable gate → recovery → wipe → import.
 * If import fails after wipe, restoreFromRecovery(proof) must rehydrate local data.
 */
export async function runConfirmedDriveAppDataRestore({
  preview,
  downloadBackup,
  createRecoveryBackup,
  wipeFn,
  importBackupJson,
  restoreFromRecovery,
  source,
  i18nKey,
} = {}) {
  assertDriveRestorePreviewReady(preview, { i18nKey: 'settings_auto_backup.drive_browser.preview_required' })

  if (typeof downloadBackup !== 'function') {
    throw createDriveRestoreNotImportableError(new Error('download_missing'), {
      parseError: 'download_missing',
    })
  }
  if (typeof importBackupJson !== 'function') {
    throw createDriveRestoreNotImportableError(new Error('import_missing'), {
      parseError: 'import_missing',
    })
  }

  let backup
  try {
    backup = await downloadBackup()
  } catch (error) {
    if (
      error?.code === DRIVE_RESTORE_NOT_IMPORTABLE_CODE
      || error?.code === DRIVE_RESTORE_PREVIEW_REQUIRED_CODE
      || error?.code === RECOVERY_BACKUP_REQUIRED_CODE
    ) {
      throw error
    }
    throw createDriveRestoreNotImportableError(error, {
      parseError: 'download_failed',
      message: `下載 Drive 備份失敗，已中止不清空本機：${String(error?.message ?? error ?? '').trim() || 'download_failed'}`,
    })
  }

  assertBackupJsonImportable(backup?.jsonText, {
    i18nKey: 'settings_auto_backup.drive_browser.not_importable',
  })

  const { imported, recoveryProof } = await runConfirmedWipeThenImportWithRecoveryRollback({
    createRecoveryBackup,
    wipeFn,
    importFn: () => importBackupJson(backup.jsonText),
    restoreFromRecovery,
    source,
    i18nKey,
  })
  return { backup, imported, recoveryProof }
}
