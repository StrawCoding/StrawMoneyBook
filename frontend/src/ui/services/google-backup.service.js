import { Capacitor } from '@capacitor/core'
import { exportAllLedgersJson } from '@/core/services/export.service'
import { getSetting, setSetting } from '@/core/repositories/settings.repo'
import { translateMessage } from '@/ui/services/i18n.service'
import { isAutoBackupDue, resolveAutoBackupIntervalHours } from '@/ui/services/auto-backup-schedule'
import {
  downloadAppDataBackupText,
  listAppDataBackups,
  listAppDataFileRevisions,
  uploadBackupJsonToAppDataFolder,
} from '@/services/google/drive-appdata-backup'
import {
  compareBackupSummaries,
  summarizeBackupJsonText,
  summarizeBackupPayload,
} from '@/core/services/backup-json-preview.service'
import { assertBackupJsonImportable } from '@/core/services/drive-appdata-restore.service'
import { getSharedLedgerSession } from '@/services/shared-ledger/backend'
import {
  getAccessToken,
  getCachedGoogleProfile,
  googleSignIn,
  googleSignOut,
  hasCachedGoogleAuthSession,
  reauth,
} from '@/services/einvoice/auth'

const GOOGLE_BACKUP_KEY = 'backup.google_drive'
const GOOGLE_BACKUP_FILENAME = 'StrawMoneyBook_all_ledgers.json'
const t = (key, params, fallback) => translateMessage(key, params, fallback)

function buildDefaultState() {
  return {
    connected: false,
    accountEmail: '',
    accountName: '',
    accountImageUrl: '',
    autoEnabled: false,
    dataChangeAutoEnabled: false,
    intervalHours: 24,
    lastBackupFilename: '',
    lastBackupAt: '',
    lastBackupStatus: 'idle',
    lastError: '',
    lastAutoCheckAt: '',
    lastAutoCheckStatus: 'idle',
    lastAutoCheckReason: '',
  }
}

function normalizeState(raw) {
  const base = buildDefaultState()
  if (!raw || typeof raw !== 'object') return base
  return {
    ...base,
    ...raw,
    connected: Boolean(raw.connected),
    accountEmail: String(raw.accountEmail ?? '').trim(),
    accountName: String(raw.accountName ?? '').trim(),
    accountImageUrl: String(raw.accountImageUrl ?? '').trim(),
    autoEnabled: Boolean(raw.autoEnabled),
    dataChangeAutoEnabled: Boolean(raw.dataChangeAutoEnabled),
    intervalHours: resolveAutoBackupIntervalHours(raw.intervalHours),
    lastBackupFilename: String(raw.lastBackupFilename ?? '').trim(),
    lastBackupAt: String(raw.lastBackupAt ?? ''),
    lastBackupStatus: String(raw.lastBackupStatus ?? 'idle'),
    lastError: String(raw.lastError ?? ''),
    lastAutoCheckAt: String(raw.lastAutoCheckAt ?? ''),
    lastAutoCheckStatus: String(raw.lastAutoCheckStatus ?? 'idle'),
    lastAutoCheckReason: String(raw.lastAutoCheckReason ?? ''),
  }
}

function assertLedgerId(ledgerId) {
  if (!ledgerId) throw new Error(t('settings_auto_backup.error.missing_ledger_id'))
}

function ensureNativePlatform() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error(t('settings_auto_backup.error.google.native_only'))
  }
}

function pickPreferredBackupFile(files) {
  if (!Array.isArray(files) || !files.length) return null
  const exact = files.find((item) => String(item?.name ?? '') === GOOGLE_BACKUP_FILENAME)
  return exact ?? files[0]
}

function normalizeDriveFileMeta(raw) {
  return {
    id: String(raw?.id ?? '').trim(),
    name: String(raw?.name ?? '').trim(),
    modifiedTime: String(raw?.modifiedTime ?? '').trim(),
    size: raw?.size != null ? String(raw.size) : '',
  }
}

function classifyDriveAppDataFile(name) {
  const filename = String(name ?? '').trim()
  if (filename === GOOGLE_BACKUP_FILENAME) return 'all_ledgers'
  if (/^StrawMoneyBook_sync_.+\.json$/i.test(filename)) return 'ledger_sync'
  if (/\.json$/i.test(filename)) return 'other_json'
  return 'other'
}

function getDriveAppDataTestMock() {
  if (typeof window === 'undefined') return null
  const mock = window.__SMB_DRIVE_APPDATA_MOCK__
  return mock && typeof mock === 'object' ? mock : null
}

async function resolveGoogleDriveAuth(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  ensureNativePlatform()
  const interactiveAuth = options?.interactiveAuth !== false
  const reauthHandler = () => reauth({
    interactive: interactiveAuth,
    requireRefreshToken: true,
  })
  const state = await getGoogleBackupState(ledgerId)
  if (!state.connected) {
    throw new Error(t('settings_auto_backup.error.google.connect_required'))
  }
  const accessToken = await getAccessToken({
    interactive: interactiveAuth,
    requireRefreshToken: true,
  })
  return { accessToken, reauthHandler, state }
}

function hasProfileIdentity(profile) {
  if (!profile || typeof profile !== 'object') return false
  return Boolean(profile.email || profile.name || profile.imageUrl)
}

function normalizeProfile(raw) {
  return {
    email: String(raw?.email ?? '').trim(),
    name: String(raw?.name ?? '').trim(),
    imageUrl: String(raw?.imageUrl ?? '').trim(),
  }
}

function profilePatchFromState(state, profile) {
  const patch = {}
  if (profile.email && profile.email !== state.accountEmail) {
    patch.accountEmail = profile.email
  }
  if (profile.name && profile.name !== state.accountName) {
    patch.accountName = profile.name
  }
  if (profile.imageUrl && profile.imageUrl !== state.accountImageUrl) {
    patch.accountImageUrl = profile.imageUrl
  }
  return patch
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

function buildRecoveredGoogleBackupPatch(patch = {}) {
  return {
    connected: true,
    lastError: '',
    lastBackupStatus: 'idle',
    ...patch,
  }
}

function buildManualGoogleConnectPatch(state, profile) {
  const patch = buildRecoveredGoogleBackupPatch({
    accountEmail: profile.email,
    accountName: profile.name,
    accountImageUrl: profile.imageUrl,
  })
  if (state?.lastAutoCheckReason === 'reauth_required') {
    patch.lastAutoCheckAt = ''
    patch.lastAutoCheckStatus = 'idle'
    patch.lastAutoCheckReason = ''
  }
  return patch
}

function isPreferredAccountMismatch(state, profile) {
  const preferredEmail = normalizeEmail(state?.accountEmail)
  const currentEmail = normalizeEmail(profile?.email)
  if (!preferredEmail || !currentEmail) return false
  return preferredEmail !== currentEmail
}

async function hydrateStateProfileFromCache(ledgerId, state) {
  if (!state.connected) return state
  const profile = normalizeProfile(getCachedGoogleProfile())
  if (isPreferredAccountMismatch(state, profile)) {
    const next = normalizeState({
      ...state,
      connected: false,
      lastError: '',
    })
    await setSetting(ledgerId, GOOGLE_BACKUP_KEY, next)
    return next
  }
  const patch = profilePatchFromState(state, profile)
  if (!Object.keys(patch).length) return state
  const next = normalizeState({ ...state, ...patch })
  await setSetting(ledgerId, GOOGLE_BACKUP_KEY, next)
  return next
}

async function resolveGoogleProfileForConnect(preferredEmail = '') {
  const normalizedPreferredEmail = normalizeEmail(preferredEmail)
  let reusedSession = false
  try {
    await getAccessToken({
      interactive: false,
      requireRefreshToken: true,
    })
    reusedSession = true
  } catch {
    reusedSession = false
  }

  let profile = normalizeProfile(getCachedGoogleProfile())
  if (normalizedPreferredEmail && normalizeEmail(profile.email) && normalizeEmail(profile.email) !== normalizedPreferredEmail) {
    reusedSession = false
    profile = normalizeProfile({})
  }
  // A cached profile only tells us who the user is — it does not mean we have a valid auth
  // session. If silent token retrieval failed (!reusedSession), we must sign in interactively
  // to obtain fresh tokens, regardless of what the profile cache contains.
  if (!reusedSession) {
    const login = await googleSignIn({
      preferredEmail: normalizedPreferredEmail || preferredEmail,
      requireRefreshToken: true,
    })
    profile = normalizeProfile(login?.profile ?? getCachedGoogleProfile())
  }

  return profile
}

function shouldAttemptSilentAutoConnect(state) {
  if (Capacitor.isNativePlatform()) return true
  if (hasCachedGoogleAuthSession()) return true
  if (!state || typeof state !== 'object') return false
  if (state.connected) return true
  return Boolean(
    state.autoEnabled
      || state.dataChangeAutoEnabled
      || state.accountEmail
      || state.accountName
      || state.accountImageUrl,
  )
}

function shouldAttemptInteractiveAutoConnect(state) {
  if (hasCachedGoogleAuthSession()) return true
  if (!state || typeof state !== 'object') return false
  if (state.connected) return true
  return Boolean(
    state.autoEnabled
      || state.dataChangeAutoEnabled
      || state.accountEmail
      || state.accountName
      || state.accountImageUrl,
  )
}

function hasConfiguredGoogleBackup(state) {
  if (!state || typeof state !== 'object') return false
  return Boolean(
    state.connected
      || state.autoEnabled
      || state.dataChangeAutoEnabled
      || state.accountEmail
      || state.accountName
      || state.accountImageUrl,
  )
}

function hasLinkedGoogleProvider() {
  const providers = Array.isArray(getSharedLedgerSession()?.user?.auth_providers)
    ? getSharedLedgerSession().user.auth_providers
    : []
  return providers.some((item) => String(item?.provider ?? '').trim() === 'google')
}

function shouldAttemptGoogleLinkedAutoConnect(state, options = {}) {
  if (!Boolean(options?.allowInteractiveWhenGoogleLinked)) return false
  if (!hasConfiguredGoogleBackup(state)) return false
  return hasLinkedGoogleProvider()
}

async function ensureConnectedBySilentAuth(ledgerId, state) {
  if (!Capacitor.isNativePlatform()) return state
  if (!shouldAttemptSilentAutoConnect(state)) return state

  let silentToken = ''
  try {
    silentToken = String(await getAccessToken({
      interactive: false,
      requireRefreshToken: true,
    }) ?? '').trim()
  } catch {
    return state
  }
  if (!silentToken) return state

  const profile = normalizeProfile(getCachedGoogleProfile())
  if (isPreferredAccountMismatch(state, profile)) {
    return saveState(ledgerId, {
      connected: false,
      lastError: '',
    })
  }
  const profilePatch = profilePatchFromState(state, profile)
  const patch = buildRecoveredGoogleBackupPatch(profilePatch)

  if (state.connected && !Object.keys(profilePatch).length && !state.lastError) {
    return state
  }
  if (!state.connected || hasProfileIdentity(profile)) {
    return saveState(ledgerId, patch)
  }
  return saveState(ledgerId, buildRecoveredGoogleBackupPatch())
}

async function saveState(ledgerId, patch) {
  const current = await getGoogleBackupState(ledgerId)
  const next = normalizeState({ ...current, ...patch })
  await setSetting(ledgerId, GOOGLE_BACKUP_KEY, next)
  return next
}

function resolveGoogleAutoBackupSkipReason(state) {
  if (!state.connected) {
    return state.lastError ? 'connect_restore_failed' : 'not_connected'
  }
  if (!state.autoEnabled) return 'auto_disabled'
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  if (!isAutoBackupDue(state)) return 'not_due'
  return ''
}

export async function getGoogleBackupState(ledgerId) {
  assertLedgerId(ledgerId)
  const stored = await getSetting(ledgerId, GOOGLE_BACKUP_KEY)
  const state = normalizeState(stored)
  return hydrateStateProfileFromCache(ledgerId, state)
}

export async function autoConnectGoogleBackup(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const allowInteractive = Boolean(options.allowInteractive)
  const state = await getGoogleBackupState(ledgerId)
  const silentState = await ensureConnectedBySilentAuth(ledgerId, state)
  const preferredEmail = String(silentState.accountEmail || state.accountEmail || '').trim()

  const shouldAttemptInteractive = shouldAttemptInteractiveAutoConnect(silentState)
    || shouldAttemptGoogleLinkedAutoConnect(silentState, options)

  if (!allowInteractive || !shouldAttemptInteractive) {
    return silentState
  }

  if (silentState.connected) {
    try {
      await getAccessToken({
        interactive: false,
        preferredEmail,
        requireRefreshToken: true,
      })
      return silentState
    } catch {
      // Fall through to interactive recovery.
    }
  }

  try {
    const profile = await resolveGoogleProfileForConnect(preferredEmail)
    return saveState(ledgerId, buildRecoveredGoogleBackupPatch({
      accountEmail: profile.email,
      accountName: profile.name,
      accountImageUrl: profile.imageUrl,
    }))
  } catch (error) {
    const detail = String(error?.message ?? error ?? '').trim()
    return saveState(ledgerId, {
      lastError: detail || t('settings_auto_backup.error.google_connect_failed'),
    })
  }
}

export async function updateGoogleBackupState(ledgerId, patch = {}) {
  assertLedgerId(ledgerId)
  return saveState(ledgerId, patch)
}

export async function connectGoogleBackup(ledgerId) {
  assertLedgerId(ledgerId)
  ensureNativePlatform()

  const current = await getGoogleBackupState(ledgerId)
  const profile = await resolveGoogleProfileForConnect(current.accountEmail)
  return saveState(ledgerId, buildManualGoogleConnectPatch(current, profile))
}

export async function disconnectGoogleBackup(ledgerId) {
  assertLedgerId(ledgerId)
  try {
    await googleSignOut()
  } catch (error) {
    console.warn('[google-backup] sign out failed', error)
  }
  return saveState(ledgerId, {
    connected: false,
    autoEnabled: false,
    accountEmail: '',
    accountName: '',
    accountImageUrl: '',
    lastAutoCheckAt: '',
    lastAutoCheckStatus: 'idle',
    lastAutoCheckReason: '',
    lastError: '',
  })
}

export async function performGoogleBackup(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  ensureNativePlatform()
  const interactiveAuth = options?.interactiveAuth !== false
  const reauthHandler = () => reauth({
    interactive: interactiveAuth,
    requireRefreshToken: true,
  })

  const state = await getGoogleBackupState(ledgerId)
  if (!state.connected) {
    throw new Error(t('settings_auto_backup.error.google.connect_required'))
  }

  const accessToken = await getAccessToken({
    interactive: interactiveAuth,
    requireRefreshToken: true,
  })
  const payload = await exportAllLedgersJson()
  const payloadText = JSON.stringify(payload, null, 2)
  const now = new Date().toISOString()
  const uploaded = await uploadBackupJsonToAppDataFolder({
    accessToken,
    reauth: reauthHandler,
    filename: GOOGLE_BACKUP_FILENAME,
    jsonText: payloadText,
  })

  const next = await saveState(ledgerId, {
    lastBackupFilename: uploaded.filename || GOOGLE_BACKUP_FILENAME,
    lastBackupAt: uploaded.modifiedTime || now,
    lastBackupStatus: 'ok',
    lastError: '',
  })

  return {
    filename: next.lastBackupFilename || GOOGLE_BACKUP_FILENAME,
    lastBackupAt: next.lastBackupAt || now,
  }
}

export async function restoreGoogleBackupJson(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const mock = getDriveAppDataTestMock()
  if (mock && typeof mock.restorePreferred === 'function') {
    return mock.restorePreferred({ ledgerId, options })
  }

  const { accessToken, reauthHandler } = await resolveGoogleDriveAuth(ledgerId, options)
  const files = await listAppDataBackups({ accessToken, reauth: reauthHandler })
  const target = pickPreferredBackupFile(files)
  if (!target?.id) {
    throw new Error(t('settings_auto_backup.error.google.restore_file_missing'))
  }

  const jsonText = await downloadAppDataBackupText({
    accessToken,
    reauth: reauthHandler,
    fileId: target.id,
  })

  return {
    filename: String(target.name ?? ''),
    modifiedTime: String(target.modifiedTime ?? ''),
    fileId: String(target.id ?? ''),
    revisionId: '',
    jsonText,
  }
}

/**
 * List every file in Google Drive appDataFolder (all_ledgers / sync_* / others).
 * Playwright may inject `window.__SMB_DRIVE_APPDATA_MOCK__` to avoid native Drive.
 */
export async function listGoogleAppDataFiles(ledgerId, options = {}) {
  assertLedgerId(ledgerId)
  const mock = getDriveAppDataTestMock()
  if (mock && typeof mock.listFiles === 'function') {
    const files = await mock.listFiles({ ledgerId, options })
    return (Array.isArray(files) ? files : []).map((item) => {
      const meta = normalizeDriveFileMeta(item)
      return {
        ...meta,
        kind: String(item?.kind ?? classifyDriveAppDataFile(meta.name)),
      }
    })
  }

  const { accessToken, reauthHandler } = await resolveGoogleDriveAuth(ledgerId, options)
  const files = await listAppDataBackups({ accessToken, reauth: reauthHandler })
  return files.map((item) => {
    const meta = normalizeDriveFileMeta(item)
    return {
      ...meta,
      kind: classifyDriveAppDataFile(meta.name),
    }
  })
}

export async function listGoogleAppDataFileRevisions(ledgerId, fileId, options = {}) {
  assertLedgerId(ledgerId)
  const normalizedFileId = String(fileId ?? '').trim()
  if (!normalizedFileId) {
    throw new Error(t('settings_auto_backup.error.google.restore_file_missing'))
  }

  const mock = getDriveAppDataTestMock()
  if (mock && typeof mock.listRevisions === 'function') {
    const revisions = await mock.listRevisions({ ledgerId, fileId: normalizedFileId, options })
    return Array.isArray(revisions) ? revisions : []
  }

  const { accessToken, reauthHandler } = await resolveGoogleDriveAuth(ledgerId, options)
  return listAppDataFileRevisions({
    accessToken,
    reauth: reauthHandler,
    fileId: normalizedFileId,
  })
}

export async function downloadGoogleAppDataBackup(ledgerId, target = {}, options = {}) {
  assertLedgerId(ledgerId)
  const fileId = String(target?.fileId ?? '').trim()
  const revisionId = String(target?.revisionId ?? '').trim()
  if (!fileId) {
    throw new Error(t('settings_auto_backup.error.google.restore_file_missing'))
  }

  const mock = getDriveAppDataTestMock()
  if (mock && typeof mock.download === 'function') {
    const downloaded = await mock.download({ ledgerId, fileId, revisionId, options })
    return {
      fileId,
      revisionId,
      filename: String(downloaded?.filename ?? target?.filename ?? ''),
      modifiedTime: String(downloaded?.modifiedTime ?? target?.modifiedTime ?? ''),
      jsonText: String(downloaded?.jsonText ?? ''),
    }
  }

  const { accessToken, reauthHandler } = await resolveGoogleDriveAuth(ledgerId, options)
  const jsonText = await downloadAppDataBackupText({
    accessToken,
    reauth: reauthHandler,
    fileId,
    revisionId: revisionId || undefined,
  })
  return {
    fileId,
    revisionId,
    filename: String(target?.filename ?? ''),
    modifiedTime: String(target?.modifiedTime ?? ''),
    jsonText,
  }
}

/**
 * Download a Drive file/revision, summarize contents, and compare against current local export.
 */
export async function previewGoogleAppDataBackup(ledgerId, target = {}, options = {}) {
  const downloaded = await downloadGoogleAppDataBackup(ledgerId, target, options)
  const remoteSummary = summarizeBackupJsonText(downloaded.jsonText)

  let localSummary = summarizeBackupPayload(null)
  let localExportedAt = ''
  try {
    const localPayload = await exportAllLedgersJson()
    localSummary = summarizeBackupPayload(localPayload)
    localExportedAt = String(localPayload?.exported_at ?? '').trim()
  } catch (error) {
    console.warn('[google-backup] local summary failed', error)
  }

  const comparison = compareBackupSummaries(remoteSummary, localSummary, {
    remoteModifiedAt: downloaded.modifiedTime || remoteSummary.exportedAt,
    localModifiedAt: localExportedAt || localSummary.exportedAt,
  })

  return {
    ...downloaded,
    remoteSummary,
    localSummary,
    comparison,
  }
}

export async function restoreGoogleBackupJsonByTarget(ledgerId, target = {}, options = {}) {
  const preview = await previewGoogleAppDataBackup(ledgerId, target, options)
  if (!preview.jsonText) {
    throw new Error(t('settings_auto_backup.error.google.restore_file_missing'))
  }
  // smb299 acceptance: refuse non-importable content before any wipe caller proceeds.
  assertBackupJsonImportable(preview.jsonText)
  return {
    filename: preview.filename,
    modifiedTime: preview.modifiedTime,
    fileId: preview.fileId,
    revisionId: preview.revisionId,
    jsonText: preview.jsonText,
    remoteSummary: preview.remoteSummary,
    localSummary: preview.localSummary,
    comparison: preview.comparison,
  }
}

export async function runGoogleAutoBackupIfDue(ledgerId) {
  assertLedgerId(ledgerId)
  const startedAt = new Date().toISOString()
  if (!Capacitor.isNativePlatform()) {
    await saveState(ledgerId, {
      lastAutoCheckAt: startedAt,
      lastAutoCheckStatus: 'skipped',
      lastAutoCheckReason: 'platform_unsupported',
    })
    return {
      status: 'skipped',
      skipped: true,
      reason: 'platform_unsupported',
      checkedAt: startedAt,
    }
  }
  const state = await autoConnectGoogleBackup(ledgerId)
  const skipReason = resolveGoogleAutoBackupSkipReason(state)
  if (skipReason) {
    // When the user has backup configured but Google auth has expired or failed,
    // treat it as an error (not just a skip) so that the UI shows a reauth warning.
    // "not configured" cases (auto_disabled, not_due, offline) remain as skipped.
    const isAuthFailure = (skipReason === 'not_connected' || skipReason === 'connect_restore_failed')
      && (state.autoEnabled || Boolean(state.accountEmail))
    await saveState(ledgerId, {
      lastAutoCheckAt: startedAt,
      lastAutoCheckStatus: isAuthFailure ? 'error' : 'skipped',
      lastAutoCheckReason: isAuthFailure ? 'reauth_required' : skipReason,
      ...(isAuthFailure ? {
        lastBackupStatus: 'error',
        lastError: t('settings_auto_backup.error.google.auto_backup_reauth_required', { detailSuffix: '' }),
      } : {}),
    })
    return {
      status: isAuthFailure ? 'error' : 'skipped',
      skipped: !isAuthFailure,
      error: isAuthFailure,
      reason: isAuthFailure ? 'reauth_required' : skipReason,
      checkedAt: startedAt,
    }
  }

  try {
    const profile = getCachedGoogleProfile()
    if (profile?.email && !state.accountEmail) {
      await saveState(ledgerId, {
        accountEmail: profile.email,
        accountName: profile.name || '',
        accountImageUrl: profile.imageUrl || '',
      })
    }
    await performGoogleBackup(ledgerId, { interactiveAuth: false })
    await saveState(ledgerId, {
      lastAutoCheckAt: startedAt,
      lastAutoCheckStatus: 'ok',
      lastAutoCheckReason: 'backup_completed',
    })
    return {
      status: 'completed',
      skipped: false,
      reason: 'backup_completed',
      checkedAt: startedAt,
    }
  } catch (error) {
    const isReauth = String(error?.code ?? '') === 'GOOGLE_REAUTH_REQUIRED'
    const detail = String(error?.message ?? error ?? '').trim()
    const detailSuffix = detail ? t('settings_auto_backup.error.detail_suffix', { detail }) : ''
    await saveState(ledgerId, {
      lastBackupStatus: 'error',
      lastError: isReauth
        ? t('settings_auto_backup.error.google.auto_backup_reauth_required', { detailSuffix })
        : detail || t('settings_auto_backup.error.google.auto_backup_failed'),
      lastAutoCheckAt: startedAt,
      lastAutoCheckStatus: 'error',
      lastAutoCheckReason: isReauth ? 'reauth_required' : 'backup_failed',
      ...(isReauth ? { connected: false } : {}),
    })
    return {
      status: 'error',
      skipped: false,
      error: true,
      reason: isReauth ? 'reauth_required' : 'backup_failed',
      checkedAt: startedAt,
    }
  }
}

export async function runGoogleAutoBackupOnDataChange(ledgerId) {
  assertLedgerId(ledgerId)
  const startedAt = new Date().toISOString()
  if (!Capacitor.isNativePlatform()) {
    await saveState(ledgerId, {
      lastAutoCheckAt: startedAt,
      lastAutoCheckStatus: 'skipped',
      lastAutoCheckReason: 'platform_unsupported',
    })
    return {
      status: 'skipped',
      skipped: true,
      reason: 'platform_unsupported',
      checkedAt: startedAt,
    }
  }
  const state = await autoConnectGoogleBackup(ledgerId)
  if (!state.connected || !state.autoEnabled || !state.dataChangeAutoEnabled) {
    const skipReason = !state.connected
      ? (state.lastError ? 'connect_restore_failed' : 'not_connected')
      : (!state.autoEnabled ? 'auto_disabled' : 'data_change_disabled')
    // Same auth-failure detection as runGoogleAutoBackupIfDue: surface as error
    // so the UI reauth warning is triggered instead of silently skipping.
    const isAuthFailure = (skipReason === 'not_connected' || skipReason === 'connect_restore_failed')
      && (state.autoEnabled || Boolean(state.accountEmail))
    await saveState(ledgerId, {
      lastAutoCheckAt: startedAt,
      lastAutoCheckStatus: isAuthFailure ? 'error' : 'skipped',
      lastAutoCheckReason: isAuthFailure ? 'reauth_required' : skipReason,
      ...(isAuthFailure ? {
        lastBackupStatus: 'error',
        lastError: t('settings_auto_backup.error.google.auto_backup_reauth_required', { detailSuffix: '' }),
      } : {}),
    })
    return {
      status: isAuthFailure ? 'error' : 'skipped',
      skipped: !isAuthFailure,
      error: isAuthFailure,
      reason: isAuthFailure ? 'reauth_required' : skipReason,
      checkedAt: startedAt,
    }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await saveState(ledgerId, {
      lastAutoCheckAt: startedAt,
      lastAutoCheckStatus: 'skipped',
      lastAutoCheckReason: 'offline',
    })
    return {
      status: 'skipped',
      skipped: true,
      reason: 'offline',
      checkedAt: startedAt,
    }
  }

  try {
    const profile = getCachedGoogleProfile()
    if (profile?.email && !state.accountEmail) {
      await saveState(ledgerId, {
        accountEmail: profile.email,
        accountName: profile.name || '',
        accountImageUrl: profile.imageUrl || '',
      })
    }
    await performGoogleBackup(ledgerId, { interactiveAuth: false })
    await saveState(ledgerId, {
      lastAutoCheckAt: startedAt,
      lastAutoCheckStatus: 'ok',
      lastAutoCheckReason: 'data_change_backup_completed',
    })
    return {
      status: 'completed',
      skipped: false,
      reason: 'data_change_backup_completed',
      checkedAt: startedAt,
    }
  } catch (error) {
    const isReauth = String(error?.code ?? '') === 'GOOGLE_REAUTH_REQUIRED'
    const detail = String(error?.message ?? error ?? '').trim()
    const detailSuffix = detail ? t('settings_auto_backup.error.detail_suffix', { detail }) : ''
    await saveState(ledgerId, {
      lastBackupStatus: 'error',
      lastError: isReauth
        ? t('settings_auto_backup.error.google.data_change_backup_reauth_required', {
            detailSuffix,
          })
        : detail || t('settings_auto_backup.error.google.data_change_backup_failed'),
      lastAutoCheckAt: startedAt,
      lastAutoCheckStatus: 'error',
      lastAutoCheckReason: isReauth ? 'reauth_required' : 'backup_failed',
      ...(isReauth ? { connected: false } : {}),
    })
    return {
      status: 'error',
      skipped: false,
      error: true,
      reason: isReauth ? 'reauth_required' : 'backup_failed',
      checkedAt: startedAt,
    }
  }
}
