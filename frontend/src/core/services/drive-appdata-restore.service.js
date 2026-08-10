/**
 * smb299: Drive appData 選檔／revision 還原编排。
 * 必須：完成可匯入預覽 → 再下載並驗證可匯入 → durable recovery → wipe → import。
 * 預覽失敗／不可匯入／recovery 失敗皆不得清空本機。
 */

import { summarizeBackupJsonText } from './backup-json-preview.service.js'
import {
  RECOVERY_BACKUP_REQUIRED_CODE,
  runConfirmedWipeAfterRecoveryBackup,
} from './data-wipe-guard.service.js'

export const DRIVE_RESTORE_PREVIEW_REQUIRED_CODE = 'DRIVE_RESTORE_PREVIEW_REQUIRED'
export const DRIVE_RESTORE_NOT_IMPORTABLE_CODE = 'DRIVE_RESTORE_NOT_IMPORTABLE'

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

/**
 * Backup JSON must parse into at least one ledger payload before wipe is allowed.
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
 * Full restore path used by DriveAppDataRestorePanel.
 * Order is intentional: preview gate → download+importable gate → recovery → wipe → import.
 * Any failure before wipeFn must leave local data intact.
 */
export async function runConfirmedDriveAppDataRestore({
  preview,
  downloadBackup,
  createRecoveryBackup,
  wipeFn,
  importBackupJson,
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

  await runConfirmedWipeAfterRecoveryBackup({
    createRecoveryBackup,
    wipeFn,
    source,
    i18nKey,
  })

  const imported = await importBackupJson(backup.jsonText)
  return { backup, imported }
}
